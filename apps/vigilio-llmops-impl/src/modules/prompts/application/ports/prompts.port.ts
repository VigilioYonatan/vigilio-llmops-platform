export interface PromptRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  application_id?: string | null;
  name: string;
  description?: string | null;
  created_by: string;
  created_at: Date;
}

export interface PromptVersionRecord {
  id: string;
  prompt_id: string;
  version: number;
  template: string;
  model: string;
  parameters: Record<string, unknown>;
  sha256: string;
  created_by: string;
  created_at: Date;
}

export interface PromptAliasRecord {
  prompt_id: string;
  environment: string;
  prompt_version_id: string;
  assigned_by: string;
  updated_at: Date;
}

export const PROMPTS_REPOSITORY = Symbol('PROMPTS_REPOSITORY');

export interface PromptsRepository {
  create(
    orgId: string,
    workspaceId: string,
    name: string,
    description: string | null,
    userId: string,
    appId?: string | null,
  ): Promise<PromptRecord>;
  list(
    workspaceId: string,
  ): Promise<Array<PromptRecord & { latest_version: number }>>;
  listByApp(appId: string): Promise<PromptRecord[]>;
  findById(id: string): Promise<PromptRecord | null>;
  findApp(id: string): Promise<{
    id: string;
    organization_id: string;
    workspace_id: string;
  } | null>;
  listVersions(promptId: string): Promise<PromptVersionRecord[]>;
  findVersion(
    promptId: string,
    versionId: string,
  ): Promise<PromptVersionRecord | null>;
  findVersions(
    promptId: string,
    versionIds: string[],
  ): Promise<PromptVersionRecord[]>;
  createVersion(
    promptId: string,
    template: string,
    model: string,
    parameters: Record<string, unknown>,
    sha256: string,
    userId: string,
  ): Promise<PromptVersionRecord>;
  findActiveRelease(
    promptVersionId: string,
    workspaceId: string,
  ): Promise<{ id: string } | null>;
  upsertAlias(
    promptId: string,
    environment: string,
    promptVersionId: string,
    userId: string,
  ): Promise<PromptAliasRecord>;
  listAliases(promptId: string): Promise<PromptAliasRecord[]>;
}
