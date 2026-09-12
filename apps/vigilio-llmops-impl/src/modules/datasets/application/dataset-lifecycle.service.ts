import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import type {
  AppDatasetRequestDto,
  CasePatchRequestDto,
  DatasetImportRequestDto,
} from '../presentation/http/dto/dataset.dto';

@Injectable()
export class DatasetLifecycleService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  private async app(
    user: string,
    id: string,
    role?: Array<'owner' | 'admin' | 'developer'>,
  ) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
    }>(
      'SELECT id,organization_id,workspace_id FROM applications WHERE id=$1 AND archived_at IS NULL',
      [id],
    );
    if (!row) throw new NotFoundException('Application not found');
    await this.tenancy.membership(user, row.organization_id, role);
    return row;
  }

  private async dataset(
    user: string,
    id: string,
    role?: Array<'owner' | 'admin' | 'developer'>,
  ) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
    }>('SELECT id,organization_id,workspace_id FROM datasets WHERE id=$1', [
      id,
    ]);
    if (!row) throw new NotFoundException('Dataset not found');
    await this.tenancy.membership(user, row.organization_id, role);
    return row;
  }

  async newDataset(user: string, app_id: string, b: AppDatasetRequestDto) {
    const app = await this.app(user, app_id, ['owner', 'admin', 'developer']);
    return this.db.one(
      'INSERT INTO datasets(organization_id,workspace_id,application_id,name,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,application_id,name',
      [app.organization_id, app.workspace_id, app_id, b.name, user],
    );
  }

  async appDatasets(user: string, app_id: string) {
    await this.app(user, app_id);
    return this.db.rows(
      'SELECT id,name,created_at FROM datasets WHERE application_id=$1 ORDER BY created_at DESC LIMIT 200',
      [app_id],
    );
  }

  async freeze(user: string, dataset_id: string) {
    const ds = await this.dataset(user, dataset_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const row = await this.db.tx(async (client) => {
      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        dataset_id,
      ]);
      const cases = await client.query<{
        id: string;
        input: string;
        expected_output: string;
      }>(
        'SELECT id,input,expected_output FROM dataset_cases WHERE dataset_id=$1 ORDER BY id',
        [dataset_id],
      );
      if (!cases.rowCount)
        throw new BadRequestException('Cannot version empty dataset');
      const digest = createHash('sha256')
        .update(JSON.stringify(cases.rows))
        .digest('hex');
      const version = await client.query<{ version: number }>(
        'SELECT COALESCE(MAX(version),0)::int+1 AS version FROM dataset_versions WHERE dataset_id=$1',
        [dataset_id],
      );
      const created = await client.query<{
        id: string;
        version: number;
        content_digest: string;
      }>(
        'INSERT INTO dataset_versions(dataset_id,version,content_digest,case_count,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,version,content_digest',
        [dataset_id, version.rows[0]?.version, digest, cases.rows.length, user],
      );
      for (let i = 0; i < cases.rows.length; i++) {
        const c = cases.rows[i]!;
        await client.query(
          'INSERT INTO dataset_version_cases(dataset_version_id,ordinal,case_id,input,expected_output) VALUES($1,$2,$3,$4,$5)',
          [created.rows[0]?.id, i, c.id, c.input, c.expected_output],
        );
      }
      return created.rows[0]!;
    });
    await this.audit.write(
      'dataset.snapshot_created',
      user,
      ds.organization_id,
      'dataset',
      dataset_id,
      { version: row.version },
    );
    return row;
  }

  async versions(user: string, dataset_id: string) {
    await this.dataset(user, dataset_id);
    return this.db.rows(
      'SELECT id,version,content_digest,case_count,created_at FROM dataset_versions WHERE dataset_id=$1 ORDER BY version DESC LIMIT 200',
      [dataset_id],
    );
  }

  async snapshotCases(user: string, dataset_id: string, version_id: string) {
    await this.dataset(user, dataset_id);
    const rows = await this.db.rows(
      'SELECT c.ordinal,c.case_id,c.input,c.expected_output FROM dataset_version_cases c JOIN dataset_versions v ON v.id=c.dataset_version_id WHERE v.dataset_id=$1 AND v.id=$2 ORDER BY c.ordinal LIMIT 5000',
      [dataset_id, version_id],
    );
    if (!rows.length)
      throw new NotFoundException('Snapshot empty or not found');
    return rows;
  }

  async patchCase(
    user: string,
    dataset_id: string,
    case_id: string,
    b: CasePatchRequestDto,
  ) {
    await this.dataset(user, dataset_id, ['owner', 'admin', 'developer']);
    const row = await this.db.tx(async (client) => {
      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        dataset_id,
      ]);
      const result = await client.query(
        'UPDATE dataset_cases SET input=COALESCE($3,input),expected_output=COALESCE($4,expected_output) WHERE id=$2 AND dataset_id=$1 RETURNING id,input,expected_output',
        [dataset_id, case_id, b.input ?? null, b.expected_output ?? null],
      );
      return result.rows[0] ?? null;
    });
    if (!row) throw new NotFoundException('Dataset case not found');
    return row;
  }

  async importCases(
    user: string,
    dataset_id: string,
    b: DatasetImportRequestDto,
  ) {
    await this.dataset(user, dataset_id, ['owner', 'admin', 'developer']);
    return this.db.tx(async (client) => {
      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        dataset_id,
      ]);
      for (const c of b.cases) {
        await client.query(
          'INSERT INTO dataset_cases(dataset_id,input,expected_output) VALUES($1,$2,$3)',
          [dataset_id, c.input, c.expected_output],
        );
      }
      const r = await client.query<{
        id: string;
        status: string;
        inserted: number;
      }>(
        'INSERT INTO dataset_imports(dataset_id,inserted) VALUES($1,$2) RETURNING id,status,inserted',
        [dataset_id, b.cases.length],
      );
      return r.rows[0]!;
    });
  }

  async importStatus(user: string, id: string) {
    const row = await this.db.one<{
      dataset_id: string;
      status: string;
      inserted: number;
      error: string | null;
      created_at: Date;
    }>(
      'SELECT dataset_id,status,inserted,error,created_at FROM dataset_imports WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Import not found');
    await this.dataset(user, row.dataset_id);
    return row;
  }
}
