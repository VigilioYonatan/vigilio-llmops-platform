import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  AlertRuleRecord,
  OperationsRepository,
} from '../../../application/ports/operations.port';

@Injectable()
export class OperationsDrizzleRepository implements OperationsRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async findRule(id: string): Promise<AlertRuleRecord | null> {
    const row = await this.sql.one<AlertRuleRecord>(
      `SELECT id, organization_id, workspace_id, name, metric, comparator, threshold, enabled, runbook_url
       FROM alert_rules
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }
}
