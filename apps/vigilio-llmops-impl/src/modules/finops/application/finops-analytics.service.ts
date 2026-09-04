import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import type {
  CostQueryDto,
  PriceCardDto,
} from '../presentation/http/dto/budget.dto';

@Injectable()
export class FinopsAnalyticsService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async create(user: string, org: string, limit: string) {
    await this.tenancy.membership(user, org, ['owner', 'admin']);
    const existing = await this.db.one(
      'SELECT organization_id FROM budget_policies WHERE organization_id=$1',
      [org],
    );
    if (existing) throw new ConflictException('Budget exists; PATCH it');
    return this.db.one(
      'INSERT INTO budget_policies(organization_id,limit_usd) VALUES($1,$2) RETURNING organization_id AS id,organization_id,limit_usd,spent_usd',
      [org, limit],
    );
  }

  async list(user: string, org: string) {
    await this.tenancy.membership(user, org);
    return this.db.rows(
      'SELECT organization_id AS id,organization_id,limit_usd,spent_usd FROM budget_policies WHERE organization_id=$1',
      [org],
    );
  }

  async patch(user: string, id: string, limit: string) {
    await this.tenancy.membership(user, id, ['owner', 'admin']);
    const row = await this.db.one(
      'UPDATE budget_policies SET limit_usd=$2 WHERE organization_id=$1 RETURNING organization_id,limit_usd,spent_usd',
      [id, limit],
    );
    if (!row) throw new NotFoundException();
    await this.audit.write('budget.changed', user, id, 'budget', id);
    return row;
  }

  async simulate(user: string, id: string, estimated: string) {
    await this.tenancy.membership(user, id);
    const row = await this.db.one<{
      allowed: boolean;
      limit_usd: string;
      spent_usd: string;
      pending_usd: string;
    }>(
      `SELECT (spent_usd + $2::numeric <= limit_usd) AS allowed,
              limit_usd::text,
              spent_usd::text,
              COALESCE((SELECT sum(estimated_usd) FROM budget_reservations WHERE organization_id=$1 AND status='reserved'), 0)::text AS pending_usd
       FROM budget_policies
       WHERE organization_id=$1`,
      [id, estimated],
    );
    if (!row) throw new NotFoundException();
    return { ...row, estimated_usd: estimated, simulation_only: true };
  }

  private range(b: CostQueryDto): [Date, Date] {
    const from = b.from
      ? new Date(b.from)
      : new Date(Date.now() - 30 * 86400000);
    const to = b.to ? new Date(b.to) : new Date();
    if (from >= to || to.getTime() - from.getTime() > 366 * 86400000) {
      throw new BadRequestException('Invalid date range');
    }
    return [from, to];
  }

  async overview(user: string, b: CostQueryDto) {
    await this.tenancy.membership(user, b.organization_id);
    const [from, to] = this.range(b);
    return this.db.one(
      'SELECT COUNT(*)::int AS requests,COALESCE(sum(estimated_cost_usd),0)::text AS estimated_usd,COALESCE(sum(input_tokens),0)::bigint AS input_tokens,COALESCE(sum(output_tokens),0)::bigint AS output_tokens FROM traces WHERE organization_id=$1 AND created_at>=$2 AND created_at<=$3',
      [b.organization_id, from, to],
    );
  }

  async usage(user: string, b: CostQueryDto) {
    await this.tenancy.membership(user, b.organization_id);
    const [from, to] = this.range(b);
    return this.db.rows(
      'SELECT application_id,model,count(*)::int AS requests,sum(input_tokens)::bigint AS input_tokens,sum(output_tokens)::bigint AS output_tokens,sum(estimated_cost_usd)::text AS estimated_usd FROM traces WHERE organization_id=$1 AND created_at>=$2 AND created_at<=$3 GROUP BY application_id,model ORDER BY requests DESC LIMIT 200',
      [b.organization_id, from, to],
    );
  }

  async ledger(user: string, b: CostQueryDto) {
    await this.tenancy.membership(user, b.organization_id, [
      'owner',
      'admin',
      'analyst',
    ]);
    const [from, to] = this.range(b);
    return this.db.rows(
      `SELECT r.id,
              r.idempotency_key,
              r.estimated_usd::text,
              COALESCE(l.amount_usd, 0)::text AS actual_usd,
              l.model,
              l.input_tokens,
              l.output_tokens,
              r.status,
              r.created_at
       FROM budget_reservations r
       LEFT JOIN cost_ledger_entries l ON l.reservation_id = r.id
       WHERE r.organization_id = $1 AND r.created_at >= $2 AND r.created_at <= $3
       ORDER BY r.created_at DESC
       LIMIT 200`,
      [b.organization_id, from, to],
    );
  }

  async priceCard(user: string, b: PriceCardDto) {
    await this.tenancy.membership(user, b.organization_id, ['owner', 'admin']);
    if (
      b.effective_from &&
      new Date(b.effective_from).getTime() < Date.now() - 86400000
    ) {
      throw new BadRequestException(
        'Price cards must not backdate historical costs',
      );
    }
    return this.db.one(
      'INSERT INTO price_cards(organization_id,model,price_input_per_million,price_output_per_million,effective_from,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,model,price_input_per_million,price_output_per_million,effective_from',
      [
        b.organization_id,
        b.model,
        b.price_input_per_million,
        b.price_output_per_million,
        b.effective_from ? new Date(b.effective_from) : new Date(),
        user,
      ],
    );
  }

  async priceCards(user: string, org: string) {
    await this.tenancy.membership(user, org);
    return this.db.rows(
      'SELECT id,model,price_input_per_million,price_output_per_million,effective_from FROM price_cards WHERE organization_id=$1 ORDER BY effective_from DESC LIMIT 200',
      [org],
    );
  }

  async reconcile(user: string, org: string) {
    await this.tenancy.membership(user, org, ['owner', 'admin']);
    return this.db.tx(async (client) => {
      const b = await client.query<{ spent_usd: string }>(
        'SELECT spent_usd::text FROM budget_policies WHERE organization_id=$1 FOR UPDATE',
        [org],
      );
      if (!b.rowCount) throw new NotFoundException();
      const r = await client.query<{ recorded: string }>(
        "SELECT COALESCE(sum(estimated_usd) FILTER(WHERE status='reserved'),0)::text AS recorded FROM budget_reservations WHERE organization_id=$1",
        [org],
      );
      const l = await client.query<{ settled_ledger_usd: string }>(
        'SELECT COALESCE(sum(amount_usd),0)::text AS settled_ledger_usd FROM cost_ledger_entries WHERE organization_id=$1',
        [org],
      );
      return {
        organization_id: org,
        spent_usd: b.rows[0]?.spent_usd,
        settled_ledger_usd: l.rows[0]?.settled_ledger_usd,
        outstanding_reserved_estimates_usd: r.rows[0]?.recorded,
        provider_reconciled: false,
        updated: false,
      };
    });
  }
}
