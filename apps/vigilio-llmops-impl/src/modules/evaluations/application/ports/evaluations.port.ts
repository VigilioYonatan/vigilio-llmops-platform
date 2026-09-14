export interface EvaluationRunRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  prompt_version_id: string;
  evaluator_version_id?: string | null;
  status: string;
  score: string | null;
  total_cases: number;
  passed_cases: number;
  created_at: Date;
  finished_at: Date | null;
}

export const EVALUATIONS_REPOSITORY = Symbol('EVALUATIONS_REPOSITORY');

export interface EvaluationsRepository {
  findById(id: string): Promise<EvaluationRunRecord | null>;
  listByWorkspace(workspaceId: string): Promise<EvaluationRunRecord[]>;
}
