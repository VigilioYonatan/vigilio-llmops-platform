import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import type {
  AddDatasetCaseRequestDto,
  CreateDatasetRequestDto,
} from '../presentation/http/dto/dataset.dto';

export interface DatasetRecord {
  id: string;
  name: string;
  workspace_id: string;
  organization_id: string;
  created_at: Date;
}

@Injectable()
export class DatasetsService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
  ) {}

  async create(user_id: string, body: CreateDatasetRequestDto) {
    const ws = await this.tenancyService.workspace(user_id, body.workspace_id, [
      'owner',
      'admin',
      'developer',
    ]);
    return this.databaseService.one<DatasetRecord>(
      'INSERT INTO datasets(organization_id,workspace_id,name,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,workspace_id,created_at',
      [ws.organization_id, body.workspace_id, body.name, user_id],
    );
  }

  async list(user_id: string, workspace_id: string) {
    await this.tenancyService.workspace(user_id, workspace_id);
    return this.databaseService.rows(
      'SELECT d.id,d.name,d.created_at,count(c.id)::int AS case_count FROM datasets d LEFT JOIN dataset_cases c ON c.dataset_id=d.id WHERE d.workspace_id=$1 GROUP BY d.id ORDER BY d.created_at DESC LIMIT 100',
      [workspace_id],
    );
  }

  async get(user_id: string, id: string): Promise<DatasetRecord> {
    const row = await this.databaseService.one<DatasetRecord>(
      'SELECT id,organization_id,workspace_id,name,created_at FROM datasets WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Dataset not found');
    await this.tenancyService.membership(user_id, row.organization_id);
    return row;
  }

  async cases(user_id: string, id: string) {
    await this.get(user_id, id);
    return this.databaseService.rows(
      'SELECT id,input,expected_output,created_at FROM dataset_cases WHERE dataset_id=$1 ORDER BY created_at LIMIT 500',
      [id],
    );
  }

  async addCase(user_id: string, id: string, body: AddDatasetCaseRequestDto) {
    const ds = await this.get(user_id, id);
    await this.tenancyService.membership(user_id, ds.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    return this.databaseService.tx(async (client) => {
      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const result = await client.query(
        'INSERT INTO dataset_cases(dataset_id,input,expected_output) VALUES($1,$2,$3) RETURNING id,input,expected_output',
        [id, body.input, body.expected_output],
      );
      return result.rows[0];
    });
  }

  async removeCase(user_id: string, id: string, case_id: string) {
    const ds = await this.get(user_id, id);
    await this.tenancyService.membership(user_id, ds.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const result = await this.databaseService.tx(async (client) => {
      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const res = await client.query(
        'DELETE FROM dataset_cases WHERE id=$1 AND dataset_id=$2 RETURNING id',
        [case_id, id],
      );
      return res.rows;
    });
    if (!result.length) throw new NotFoundException('Dataset case not found');
    return { removed: true };
  }
}
