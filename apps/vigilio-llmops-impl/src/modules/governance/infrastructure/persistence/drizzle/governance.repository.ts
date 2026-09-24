import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  AuditEventRecord,
  GovernanceRepository,
} from '../../../application/ports/governance.port';

@Injectable()
export class GovernanceDrizzleRepository implements GovernanceRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async findAuditEvent(id: number): Promise<AuditEventRecord | null> {
    const row = await this.sql.one<AuditEventRecord>(
      `SELECT id, organization_id, actor_id, action, resource_type, resource_id, metadata, created_at
       FROM audit_events
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }
}
