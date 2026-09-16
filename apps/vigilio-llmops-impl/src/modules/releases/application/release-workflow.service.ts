import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { Principal } from '../../../shared/http/principal';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { isPromotionEligible } from '../domain/release-policy';

@Injectable()
export class ReleaseWorkflowService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  private async release(user: string, id: string) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
      status: string;
      created_by: string;
      prompt_version_id: string;
    }>(
      'SELECT id,organization_id,workspace_id,status,created_by,prompt_version_id FROM releases WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Release not found');
    await this.tenancy.membership(user, row.organization_id);
    return row;
  }

  private async policy(user: string, id: string, write = false) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
      minimum_score: string;
    }>(
      'SELECT id,organization_id,workspace_id,minimum_score FROM quality_policies WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Quality policy not found');
    await this.tenancy.membership(
      user,
      row.organization_id,
      write ? ['owner', 'admin'] : undefined,
    );
    return row;
  }

  async policyVersion(user: string, id: string, minimum_score: number) {
    await this.policy(user, id, true);
    return this.db.tx(async (client) => {
      await client.query(
        'SELECT id FROM quality_policies WHERE id=$1 FOR UPDATE',
        [id],
      );
      const v = await client.query<{ n: number }>(
        'SELECT COALESCE(MAX(version),0)::int+1 AS n FROM quality_policy_versions WHERE policy_id=$1',
        [id],
      );
      const created = await client.query(
        'INSERT INTO quality_policy_versions(policy_id,version,minimum_score,created_by) VALUES($1,$2,$3,$4) RETURNING id,version,minimum_score',
        [id, v.rows[0]?.n, minimum_score, user],
      );
      await client.query(
        'UPDATE quality_policies SET minimum_score=$2 WHERE id=$1',
        [id, minimum_score],
      );
      return created.rows[0]!;
    });
  }

  async dryRun(user: string, policy_id: string, run_id: string) {
    const policy = await this.policy(user, policy_id);
    const run = await this.db.one<{
      workspace_id: string;
      score: string | null;
      status: string;
    }>('SELECT workspace_id,score,status FROM evaluation_runs WHERE id=$1', [
      run_id,
    ]);
    if (!run || run.workspace_id !== policy.workspace_id)
      throw new NotFoundException('Run not found in workspace');
    return {
      passed: isPromotionEligible(
        Number(run.score),
        Number(policy.minimum_score),
        run.status,
      ),
      score: run.score,
      required: policy.minimum_score,
      simulation_only: true,
    };
  }

  async requestApproval(user: string, id: string) {
    const r = await this.release(user, id);
    await this.tenancy.membership(user, r.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const updated = await this.db.one(
      "UPDATE releases SET status='approval_requested' WHERE id=$1 AND status='verified' RETURNING id,status",
      [id],
    );
    if (!updated) throw new ConflictException('Release is not verified');
    await this.db.rows(
      'INSERT INTO release_workflow_events(release_id, action, actor_id) VALUES($1, $2, $3)',
      [id, 'approval_requested', user],
    );
    await this.audit.write(
      'release.approval_requested',
      user,
      r.organization_id,
      'release',
      id,
    );
    return updated;
  }

  async reject(p: Principal, id: string, reason: string) {
    const r = await this.release(p.user_id, id);
    await this.tenancy.membership(p.user_id, r.organization_id, [
      'owner',
      'approver',
    ]);
    if (r.created_by === p.user_id)
      throw new ForbiddenException('Author cannot reject own release');
    const updated = await this.db.one(
      "UPDATE releases SET status='rejected' WHERE id=$1 AND status IN ('verified','approval_requested') RETURNING id,status",
      [id],
    );
    if (!updated)
      throw new ConflictException(
        'Release cannot be rejected in current state',
      );
    await this.db.rows(
      'INSERT INTO release_workflow_events(release_id,action,actor_id,detail) VALUES($1,$2,$3,$4)',
      [id, 'rejected', p.user_id, JSON.stringify({ reason })],
    );
    await this.audit.write(
      'release.rejected',
      p.user_id,
      r.organization_id,
      'release',
      id,
      { reason },
    );
    return updated;
  }

  async rollout(user: string, id: string) {
    const r = await this.release(user, id);
    return {
      release_id: id,
      status: r.status,
      strategy: 'atomic_configuration',
      traffic_routing_enforced: false,
      percentage: null,
      canary_available: false,
      explanation:
        'Gateway traffic weighting is not enabled; active status represents instantaneous atomic configuration pointer',
    };
  }

  async pause(user: string, id: string) {
    await this.release(user, id);
    throw new ConflictException(
      'Traffic control unavailable: pause requires a weighted traffic mesh',
    );
  }

  async resume(user: string, id: string) {
    await this.release(user, id);
    throw new ConflictException(
      'Traffic control unavailable: resume requires a weighted traffic mesh',
    );
  }

  async evidence(user: string, id: string) {
    const r = await this.release(user, id);
    const run = await this.db.one(
      'SELECT r.status,r.score,r.total_cases,r.passed_cases FROM releases l JOIN evaluation_runs r ON r.id=l.evaluation_run_id WHERE l.id=$1',
      [id],
    );
    const events = await this.db.rows(
      'SELECT action,actor_id,created_at,detail FROM release_workflow_events WHERE release_id=$1 ORDER BY created_at',
      [id],
    );
    return {
      release_id: id,
      configuration_status: r.status,
      evaluation: run,
      approval_events: events,
      observed_traffic: null,
    };
  }
}
