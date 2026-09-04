import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { calculateTokenCostUsd } from '../domain/cost-calculator';
import type { LedgerWriteInput } from './ports/finops.port';

@Injectable()
export class BudgetService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
  ) {}

  async upsert(userId: string, organizationId: string, limitUsd: string) {
    await this.tenancyService.membership(userId, organizationId, [
      'owner',
      'admin',
    ]);
    const row = await this.databaseService.one<{
      organization_id: string;
      limit_usd: string;
      spent_usd: string;
    }>(
      'INSERT INTO budget_policies(organization_id,limit_usd) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET limit_usd=$2 RETURNING organization_id,limit_usd::text,spent_usd::text',
      [organizationId, limitUsd],
    );
    return {
      organization_id: row?.organization_id ?? organizationId,
      limit_usd: row?.limit_usd ?? limitUsd,
      spent_usd: row?.spent_usd ?? '0.000000',
      configured: true,
    };
  }

  async get(userId: string, organizationId: string) {
    await this.tenancyService.membership(userId, organizationId);
    const row = await this.databaseService.one<{
      organization_id: string;
      limit_usd: string;
      spent_usd: string;
    }>(
      'SELECT organization_id,limit_usd::text,spent_usd::text FROM budget_policies WHERE organization_id=$1',
      [organizationId],
    );
    if (!row) {
      return {
        organization_id: organizationId,
        limit_usd: '0.000000',
        spent_usd: '0.000000',
        configured: false,
      };
    }
    return { ...row, configured: true };
  }

  async calculateCostForUsage(
    organizationId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    providerKind: 'ollama' | 'openai-compatible' = 'ollama',
  ): Promise<{ budgetUsd6: string; ledgerUsd8: string }> {
    const card = await this.databaseService.one<{
      price_input_per_million: string;
      price_output_per_million: string;
    }>(
      'SELECT price_input_per_million, price_output_per_million FROM price_cards WHERE organization_id=$1 AND model=$2 AND effective_from <= now() ORDER BY effective_from DESC LIMIT 1',
      [organizationId, model],
    );
    if (card) {
      return calculateTokenCostUsd(
        inputTokens,
        outputTokens,
        card.price_input_per_million,
        card.price_output_per_million,
      );
    }
    if (providerKind === 'openai-compatible') {
      return calculateTokenCostUsd(
        inputTokens,
        outputTokens,
        '0.15000000',
        '0.60000000',
      );
    }
    return { budgetUsd6: '0.000000', ledgerUsd8: '0.00000000' };
  }

  async reserve(
    organizationId: string,
    idempotencyKey: string,
    estimatedUsd: string,
  ) {
    return this.databaseService.tx(async (client) => {
      // Row lock + pure PostgreSQL numeric comparison prevents race conditions and float drift.
      const policy = await client.query<{
        limit_usd: string;
        spent_usd: string;
        exceeds: boolean;
      }>(
        'SELECT limit_usd, spent_usd, (spent_usd + $2::numeric > limit_usd) AS exceeds FROM budget_policies WHERE organization_id=$1 FOR UPDATE',
        [organizationId, estimatedUsd],
      );
      if (!policy.rowCount)
        throw new NotFoundException('Budget not configured');

      const existing = await client.query<{ id: string; status: string }>(
        'SELECT id,status FROM budget_reservations WHERE organization_id=$1 AND idempotency_key=$2',
        [organizationId, idempotencyKey],
      );
      if (existing.rowCount) {
        return { ...existing.rows[0]!, duplicate: true };
      }

      if (policy.rows[0]?.exceeds) {
        throw new ConflictException('Budget hard cap exceeded');
      }

      const row = await client.query<{ id: string; status: string }>(
        'INSERT INTO budget_reservations(organization_id,idempotency_key,estimated_usd) VALUES($1,$2,$3) RETURNING id,status',
        [organizationId, idempotencyKey, estimatedUsd],
      );
      await client.query(
        'UPDATE budget_policies SET spent_usd = spent_usd + $2::numeric WHERE organization_id=$1',
        [organizationId, estimatedUsd],
      );
      return { ...row.rows[0]!, duplicate: false };
    });
  }

  async settle(
    organizationId: string,
    reservationId: string,
    actualUsd: string,
    successful: boolean,
    ledgerEntry?: Omit<LedgerWriteInput, 'organization_id' | 'reservation_id'>,
  ): Promise<void> {
    await this.databaseService.tx(async (client) => {
      const reserved = await client.query<{
        status: string;
        estimated_usd: string;
      }>(
        'SELECT status,estimated_usd FROM budget_reservations WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [reservationId, organizationId],
      );
      if (!reserved.rowCount || reserved.rows[0]?.status !== 'reserved') return;

      await client.query(
        'UPDATE budget_reservations SET status=$2 WHERE id=$1',
        [reservationId, successful ? 'settled' : 'cancelled'],
      );

      if (successful) {
        await client.query(
          'UPDATE budget_policies SET spent_usd = GREATEST(0, spent_usd + ($2::numeric - $3::numeric)) WHERE organization_id=$1',
          [organizationId, actualUsd, reserved.rows[0]?.estimated_usd],
        );
        if (ledgerEntry) {
          await client.query(
            `INSERT INTO cost_ledger_entries(organization_id,workspace_id,application_id,reservation_id,model,source,input_tokens,output_tokens,amount_usd)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric)`,
            [
              organizationId,
              ledgerEntry.workspace_id ?? null,
              ledgerEntry.application_id ?? null,
              reservationId,
              ledgerEntry.model,
              ledgerEntry.source ?? 'gateway',
              ledgerEntry.input_tokens,
              ledgerEntry.output_tokens,
              ledgerEntry.amount_usd,
            ],
          );
        }
      } else {
        await client.query(
          'UPDATE budget_policies SET spent_usd = GREATEST(0, spent_usd - $2::numeric) WHERE organization_id=$1',
          [organizationId, reserved.rows[0]?.estimated_usd],
        );
      }
    });
  }
}
