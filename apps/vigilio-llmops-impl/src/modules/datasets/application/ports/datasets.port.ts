export interface DatasetRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  application_id?: string | null;
  name: string;
  created_by: string;
  created_at: Date;
}

export const DATASETS_REPOSITORY = Symbol('DATASETS_REPOSITORY');

export interface DatasetsRepository {
  create(
    orgId: string,
    workspaceId: string,
    name: string,
    userId: string,
    appId?: string | null,
  ): Promise<DatasetRecord>;
  list(
    workspaceId: string,
  ): Promise<Array<DatasetRecord & { case_count: number }>>;
  findById(id: string): Promise<DatasetRecord | null>;
}
