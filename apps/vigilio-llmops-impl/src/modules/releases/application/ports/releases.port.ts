export interface QualityPolicyRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  minimum_score: string;
  created_by: string;
  created_at: Date;
}

export interface ReleaseRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  prompt_id?: string;
  prompt_version_id: string;
  evaluation_run_id: string;
  policy_id: string;
  environment: string;
  status: string;
  policy_threshold_snapshot: string;
  created_by: string;
  approved_by?: string | null;
  approved_at?: Date | null;
  created_at: Date;
}

export const RELEASES_REPOSITORY = Symbol('RELEASES_REPOSITORY');

export interface ReleasesRepository {
  createPolicy(
    orgId: string,
    workspaceId: string,
    name: string,
    minimumScore: number,
    userId: string,
  ): Promise<QualityPolicyRecord>;
  listPolicies(workspaceId: string): Promise<QualityPolicyRecord[]>;
  findPolicy(id: string): Promise<QualityPolicyRecord | null>;
  createRelease(
    orgId: string,
    workspaceId: string,
    promptId: string,
    promptVersionId: string,
    evaluationRunId: string,
    policyId: string,
    environment: string,
    userId: string,
  ): Promise<ReleaseRecord>;
  listReleases(workspaceId: string): Promise<ReleaseRecord[]>;
  findRelease(id: string): Promise<ReleaseRecord | null>;
}
