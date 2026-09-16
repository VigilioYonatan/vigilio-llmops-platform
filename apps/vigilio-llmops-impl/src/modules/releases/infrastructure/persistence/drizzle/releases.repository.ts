import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  QualityPolicyRecord,
  ReleaseRecord,
  ReleasesRepository,
} from '../../../application/ports/releases.port';

@Injectable()
export class ReleasesDrizzleRepository implements ReleasesRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async createPolicy(
    orgId: string,
    workspaceId: string,
    name: string,
    minimumScore: number,
    userId: string,
  ): Promise<QualityPolicyRecord> {
    const row = await this.sql.one<QualityPolicyRecord>(
      `INSERT INTO quality_policies(organization_id, workspace_id, name, minimum_score, created_by)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, organization_id, workspace_id, name, minimum_score, created_by, created_at`,
      [orgId, workspaceId, name, minimumScore, userId],
    );
    return row!;
  }

  async listPolicies(workspaceId: string): Promise<QualityPolicyRecord[]> {
    return this.sql.rows<QualityPolicyRecord>(
      `SELECT id, organization_id, workspace_id, name, minimum_score, created_by, created_at
       FROM quality_policies
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId],
    );
  }

  async findPolicy(id: string): Promise<QualityPolicyRecord | null> {
    const row = await this.sql.one<QualityPolicyRecord>(
      `SELECT id, organization_id, workspace_id, name, minimum_score, created_by, created_at
       FROM quality_policies
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async createRelease(
    orgId: string,
    workspaceId: string,
    promptId: string,
    promptVersionId: string,
    evaluationRunId: string,
    policyId: string,
    environment: string,
    userId: string,
  ): Promise<ReleaseRecord> {
    const row = await this.sql.one<ReleaseRecord>(
      `INSERT INTO releases(organization_id, workspace_id, prompt_id, prompt_version_id, evaluation_run_id, policy_id, environment, created_by, policy_threshold_snapshot)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, minimum_score
       FROM quality_policies
       WHERE id = $6 AND workspace_id = $2
       RETURNING id, organization_id, workspace_id, prompt_id, prompt_version_id, evaluation_run_id, policy_id, environment, status, policy_threshold_snapshot, created_by, created_at`,
      [
        orgId,
        workspaceId,
        promptId,
        promptVersionId,
        evaluationRunId,
        policyId,
        environment,
        userId,
      ],
    );
    return row!;
  }

  async listReleases(workspaceId: string): Promise<ReleaseRecord[]> {
    return this.sql.rows<ReleaseRecord>(
      `SELECT id, organization_id, workspace_id, prompt_id, prompt_version_id, evaluation_run_id, policy_id, environment, status, policy_threshold_snapshot, created_by, approved_by, approved_at, created_at
       FROM releases
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId],
    );
  }

  async findRelease(id: string): Promise<ReleaseRecord | null> {
    const row = await this.sql.one<ReleaseRecord>(
      `SELECT id, organization_id, workspace_id, prompt_id, prompt_version_id, evaluation_run_id, policy_id, environment, status, policy_threshold_snapshot, created_by, approved_by, approved_at, created_at
       FROM releases
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }
}
