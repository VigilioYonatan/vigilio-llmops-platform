import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  DatasetRecord,
  DatasetsRepository,
} from '../../../application/ports/datasets.port';

@Injectable()
export class DatasetsDrizzleRepository implements DatasetsRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async create(
    orgId: string,
    workspaceId: string,
    name: string,
    userId: string,
    appId?: string | null,
  ): Promise<DatasetRecord> {
    const row = await this.sql.one<DatasetRecord>(
      `INSERT INTO datasets(organization_id, workspace_id, application_id, name, created_by)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, organization_id, workspace_id, application_id, name, created_by, created_at`,
      [orgId, workspaceId, appId ?? null, name, userId],
    );
    return row!;
  }

  async list(
    workspaceId: string,
  ): Promise<Array<DatasetRecord & { case_count: number }>> {
    return this.sql.rows<DatasetRecord & { case_count: number }>(
      `SELECT d.id, d.organization_id, d.workspace_id, d.application_id, d.name, d.created_by, d.created_at,
              count(c.id)::int AS case_count
       FROM datasets d
       LEFT JOIN dataset_cases c ON c.dataset_id = d.id
       WHERE d.workspace_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC
       LIMIT 100`,
      [workspaceId],
    );
  }

  async findById(id: string): Promise<DatasetRecord | null> {
    const row = await this.sql.one<DatasetRecord>(
      `SELECT id, organization_id, workspace_id, application_id, name, created_by, created_at
       FROM datasets
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }
}
