import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';

@Injectable()
export class GovernanceService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async auditEvents(user: string, org: string, limit: number, before?: number) {
    await this.tenancy.membership(user, org, ['owner', 'admin', 'approver']);
    return this.db.rows(
      'SELECT id, actor_id, action, resource_type, resource_id, metadata, created_at FROM audit_events WHERE organization_id = $1 AND ($2::bigint IS NULL OR id < $2) ORDER BY id DESC LIMIT $3',
      [org, before ?? null, limit],
    );
  }

  async auditEvent(user: string, id: number) {
    const row = await this.db.one<{ organization_id: string }>(
      'SELECT id, organization_id, actor_id, action, resource_type, resource_id, metadata, created_at FROM audit_events WHERE id = $1',
      [id],
    );
    if (!row || !row.organization_id)
      throw new NotFoundException('Audit event not found');
    await this.tenancy.membership(user, row.organization_id, [
      'owner',
      'admin',
      'approver',
    ]);
    return row;
  }

  async request(user: string, kind: 'export' | 'delete', reason?: string) {
    const row = await this.db.one<{
      id: string;
      kind: string;
      status: string;
      created_at: Date;
    }>(
      'INSERT INTO data_requests(user_id, kind, reason) VALUES($1, $2, $3) RETURNING id, kind, status, created_at',
      [user, kind, reason ?? null],
    );
    await this.audit.write(
      `data.requested_${kind}`,
      user,
      null,
      'data_request',
      String(row?.id),
    );
    return row;
  }

  async requestStatus(user: string, id: string) {
    const row = await this.db.one(
      'SELECT id, kind, status, created_at, completed_at FROM data_requests WHERE id = $1 AND user_id = $2',
      [id, user],
    );
    if (!row) throw new NotFoundException('Data request not found');
    return row;
  }

  async myRequests(user: string) {
    return this.db.rows(
      'SELECT id, kind, status, reason, created_at, completed_at FROM data_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user],
    );
  }
}
