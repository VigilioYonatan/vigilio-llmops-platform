import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import type {
  AlertRulePatchRequestDto,
  AlertRuleRequestDto,
  IncidentCreateRequestDto,
  IncidentEventRequestDto,
  IncidentRegressionRequestDto,
  IncidentResolveRequestDto,
} from '../presentation/http/dto/operations.dto';

@Injectable()
export class OperationsService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async addRule(user: string, b: AlertRuleRequestDto) {
    const ws = await this.tenancy.workspace(user, b.workspace_id, [
      'owner',
      'admin',
    ]);
    const row = await this.db.one<{
      id: string;
      name: string;
      metric: string;
      comparator: string;
      threshold: string;
      enabled: boolean;
      runbook_url: string;
    }>(
      'INSERT INTO alert_rules(organization_id,workspace_id,name,metric,comparator,threshold,runbook_url,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,metric,comparator,threshold,enabled,runbook_url',
      [
        ws.organization_id,
        b.workspace_id,
        b.name,
        b.metric,
        b.comparator,
        b.threshold,
        b.runbook_url,
        user,
      ],
    );
    if (row)
      await this.audit.write(
        'alert.rule_created',
        user,
        ws.organization_id,
        'alert_rule',
        String(row.id),
      );
    return row;
  }

  async rules(user: string, workspace: string) {
    await this.tenancy.workspace(user, workspace);
    return this.db.rows(
      'SELECT id,name,metric,comparator,threshold,runbook_url,enabled,created_at FROM alert_rules WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200',
      [workspace],
    );
  }

  async rule(user: string, id: string, roles?: Array<'owner' | 'admin'>) {
    const row = await this.db.one<{ id: string; organization_id: string }>(
      'SELECT id,organization_id FROM alert_rules WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Alert rule not found');
    await this.tenancy.membership(user, row.organization_id, roles);
    return row;
  }

  async patchRule(user: string, id: string, b: AlertRulePatchRequestDto) {
    const row = await this.rule(user, id, ['owner', 'admin']);
    const result = await this.db.one(
      'UPDATE alert_rules SET name=COALESCE($2,name),threshold=COALESCE($3,threshold),enabled=COALESCE($4,enabled),runbook_url=COALESCE($5,runbook_url) WHERE id=$1 RETURNING id,name,threshold,enabled,runbook_url',
      [
        id,
        b.name ?? null,
        b.threshold ?? null,
        b.enabled ?? null,
        b.runbook_url ?? null,
      ],
    );
    await this.audit.write(
      'alert.rule_updated',
      user,
      row.organization_id,
      'alert_rule',
      id,
    );
    return result;
  }

  async alerts(user: string, workspace: string) {
    await this.tenancy.workspace(user, workspace);
    return this.db.rows(
      'SELECT id,rule_id,title,severity,created_at,acknowledged_at FROM alerts WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200',
      [workspace],
    );
  }

  async acknowledge(user: string, id: string) {
    const row = await this.db.one<{ id: string; organization_id: string }>(
      'SELECT id,organization_id FROM alerts WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Alert not found');
    await this.tenancy.membership(user, row.organization_id, [
      'owner',
      'admin',
      'developer',
      'approver',
    ]);
    const updated = await this.db.one(
      'UPDATE alerts SET acknowledged_by=$2,acknowledged_at=now() WHERE id=$1 AND acknowledged_at IS NULL RETURNING id,acknowledged_at',
      [id, user],
    );
    if (!updated) throw new ConflictException('Already acknowledged');
    await this.audit.write(
      'alert.acknowledged',
      user,
      row.organization_id,
      'alert',
      id,
    );
    return updated;
  }

  async addIncident(user: string, b: IncidentCreateRequestDto) {
    const ws = await this.tenancy.workspace(user, b.workspace_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const r = await this.db.one<{
      id: string;
      title: string;
      severity: string;
      status: string;
      created_at: Date;
    }>(
      'INSERT INTO incidents(organization_id,workspace_id,title,severity,summary,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,severity,status,created_at',
      [
        ws.organization_id,
        b.workspace_id,
        b.title,
        b.severity,
        b.summary ?? null,
        user,
      ],
    );
    if (r)
      await this.audit.write(
        'incident.created',
        user,
        ws.organization_id,
        'incident',
        String(r.id),
      );
    return r;
  }

  async incidents(user: string, workspace: string) {
    await this.tenancy.workspace(user, workspace);
    return this.db.rows(
      'SELECT id,title,severity,status,summary,created_at,resolved_at FROM incidents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200',
      [workspace],
    );
  }

  async incident(
    user: string,
    id: string,
    roles?: Array<'owner' | 'admin' | 'developer' | 'approver'>,
  ) {
    const r = await this.db.one<{
      id: string;
      organization_id: string;
      title: string;
      severity: string;
      status: string;
      summary: string | null;
      created_at: Date;
      resolved_at: Date | null;
    }>(
      'SELECT id,organization_id,title,severity,status,summary,created_at,resolved_at FROM incidents WHERE id=$1',
      [id],
    );
    if (!r) throw new NotFoundException('Incident not found');
    await this.tenancy.membership(user, r.organization_id, roles);
    return r;
  }

  async incidentDetail(user: string, id: string) {
    const row = await this.incident(user, id);
    const timeline = await this.db.rows(
      'SELECT id,message,created_at,author_id FROM incident_events WHERE incident_id=$1 ORDER BY created_at ASC LIMIT 300',
      [id],
    );
    return { ...row, timeline };
  }

  async incidentEvent(user: string, id: string, b: IncidentEventRequestDto) {
    const r = await this.incident(user, id, [
      'owner',
      'admin',
      'developer',
      'approver',
    ]);
    if (r.status === 'resolved')
      throw new ConflictException('Incident already resolved');
    return this.db.one(
      'INSERT INTO incident_events(incident_id,message,author_id) VALUES($1,$2,$3) RETURNING id,created_at',
      [id, b.message, user],
    );
  }

  async resolve(user: string, id: string, b: IncidentResolveRequestDto) {
    const r = await this.incident(user, id, ['owner', 'admin', 'approver']);
    const result = await this.db.tx(async (client) => {
      const updated = await client.query(
        "UPDATE incidents SET status='resolved',resolved_at=now() WHERE id=$1 AND status='open' RETURNING id,resolved_at",
        [id],
      );
      if (!updated.rowCount)
        throw new ConflictException('Incident already resolved');
      await client.query(
        'INSERT INTO incident_events(incident_id,message,author_id) VALUES ($1,$2,$3)',
        [
          id,
          JSON.stringify({
            root_cause: b.root_cause,
            corrective_action: b.corrective_action,
          }),
          user,
        ],
      );
      return updated.rows[0];
    });
    await this.audit.write(
      'incident.resolved',
      user,
      r.organization_id,
      'incident',
      id,
    );
    return result;
  }

  async regression(user: string, id: string, b: IncidentRegressionRequestDto) {
    const inc = await this.incident(user, id, ['owner', 'admin', 'developer']);
    const ds = await this.db.one<{ id: string; organization_id: string }>(
      'SELECT id,organization_id FROM datasets WHERE id=$1',
      [b.dataset_id],
    );
    if (!ds || ds.organization_id !== inc.organization_id)
      throw new NotFoundException('Dataset not found');
    const row = await this.db.tx(async (client) => {
      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        b.dataset_id,
      ]);
      const inserted = await client.query<{
        id: string;
        input: string;
        expected_output: string;
      }>(
        'INSERT INTO dataset_cases(dataset_id,input,expected_output) VALUES($1,$2,$3) RETURNING id,input,expected_output',
        [b.dataset_id, b.input, b.expected_output],
      );
      return inserted.rows[0] ?? null;
    });
    await this.audit.write(
      'incident.regression_added',
      user,
      inc.organization_id,
      'incident',
      id,
      {
        case_id: row?.id ?? null,
      },
    );
    return row;
  }
}
