export interface SystemCapabilities {
  platform: string;
  version: string;
  self_hosted: boolean;
  local_passwords: boolean;
  facebook_login: boolean;
  prompts: boolean;
  dataset_snapshots: boolean;
  deterministic_evaluation: boolean;
  rag_hybrid_pgvector: boolean;
}

export const SYSTEM_REPOSITORY = Symbol('SYSTEM_REPOSITORY');

export interface SystemRepository {
  getCapabilities(): SystemCapabilities;
}
