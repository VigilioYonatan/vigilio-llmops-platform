import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { randomToken, sha256 } from '../../../shared/crypto';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { formatApiKeyPrefix } from '../domain/api-key-policy';
import type {
  AppCreateRequestDto,
  CreateScopedAppDto,
  KeyCreateRequestDto,
} from '../presentation/http/dto/application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
    private readonly auditService: AuditService,
  ) {}

  async create(userId: string, body: AppCreateRequestDto) {
    const workspace = await this.tenancyService.workspace(
      userId,
      body.workspace_id,
      ['owner', 'admin', 'developer'],
    );
    const app = await this.databaseService.tx(async (client) => {
      const inserted = await client.query<{
        id: string;
        workspace_id: string;
        name: string;
        environment: string;
        created_at: Date;
      }>(
        'INSERT INTO applications(organization_id,workspace_id,name,environment) VALUES($1,$2,$3,$4) RETURNING id,workspace_id,name,environment,created_at',
        [
          workspace.organization_id,
          body.workspace_id,
          body.name,
          body.environment,
        ],
      );
      const row = inserted.rows[0]!;
      await client.query(
        'INSERT INTO application_environments(application_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [row.id, body.environment],
      );
      return row;
    });
    await this.auditService.write(
      'application.created',
      userId,
      workspace.organization_id,
      'application',
      String(app.id),
    );
    return app;
  }

  async createScoped(
    userId: string,
    workspaceId: string,
    body: CreateScopedAppDto,
  ) {
    return this.create(userId, {
      workspace_id: workspaceId,
      name: body.name,
      environment: body.environment,
    });
  }

  async list(userId: string, workspaceId: string) {
    await this.tenancyService.workspace(userId, workspaceId);
    return this.databaseService.rows(
      'SELECT id,name,environment,created_at FROM applications WHERE workspace_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 100',
      [workspaceId],
    );
  }

  async get(userId: string, id: string) {
    const app = await this.databaseService.one<{
      id: string;
      workspace_id: string;
      organization_id: string;
      name: string;
      environment: string;
    }>(
      'SELECT id,workspace_id,organization_id,name,environment FROM applications WHERE id=$1 AND archived_at IS NULL',
      [id],
    );
    if (!app) throw new NotFoundException();
    await this.tenancyService.membership(userId, app.organization_id);
    return app;
  }

  async patch(userId: string, id: string, name: string) {
    const app = await this.get(userId, id);
    await this.tenancyService.membership(userId, app.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const updated = await this.databaseService.one(
      'UPDATE applications SET name=$2 WHERE id=$1 RETURNING id,name,environment',
      [id, name],
    );
    await this.auditService.write(
      'application.updated',
      userId,
      app.organization_id,
      'application',
      id,
    );
    return updated;
  }

  async addEnvironment(
    userId: string,
    id: string,
    name: 'dev' | 'staging' | 'production',
  ) {
    const app = await this.get(userId, id);
    await this.tenancyService.membership(userId, app.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const env = await this.databaseService.one(
      'INSERT INTO application_environments(application_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id,name,created_at',
      [id, name],
    );
    if (!env) throw new ConflictException('Environment already registered');
    return env;
  }

  async environments(userId: string, id: string) {
    await this.get(userId, id);
    return this.databaseService.rows(
      'SELECT id,name,created_at FROM application_environments WHERE application_id=$1 ORDER BY name',
      [id],
    );
  }

  async summary(userId: string, id: string) {
    await this.get(userId, id);
    return this.databaseService.one(
      "SELECT COUNT(*)::int AS requests,COUNT(*) FILTER(WHERE status<>'success')::int AS errors,COALESCE(avg(latency_ms),0)::int AS avg_latency_ms,COALESCE(sum(estimated_cost_usd),0)::text AS estimated_cost_usd FROM traces WHERE application_id=$1",
      [id],
    );
  }

  async createKey(userId: string, appId: string, body: KeyCreateRequestDto) {
    const app = await this.get(userId, appId);
    await this.tenancyService.membership(userId, app.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const token = `vgl_${randomToken(36)}`;
    const key = await this.databaseService.one(
      "INSERT INTO application_keys(application_id,token_hash,prefix,scopes,expires_at) VALUES($1,$2,$3,$4,now()+($5*interval '1 day')) RETURNING id,prefix,scopes,expires_at,created_at",
      [
        appId,
        sha256(token),
        formatApiKeyPrefix(token),
        body.scopes,
        body.expires_in_days,
      ],
    );
    await this.auditService.write(
      'application.key_created',
      userId,
      app.organization_id,
      'application',
      appId,
    );
    return { ...key, token };
  }

  async listKeys(userId: string, appId: string) {
    await this.get(userId, appId);
    return this.databaseService.rows(
      'SELECT id,prefix,scopes,created_at,expires_at,revoked_at FROM application_keys WHERE application_id=$1 ORDER BY created_at DESC LIMIT 100',
      [appId],
    );
  }

  async revokeKey(userId: string, appId: string, keyId: string) {
    const app = await this.get(userId, appId);
    await this.tenancyService.membership(userId, app.organization_id, [
      'owner',
      'admin',
    ]);
    const result = await this.databaseService.rows(
      'UPDATE application_keys SET revoked_at=now() WHERE id=$1 AND application_id=$2 AND revoked_at IS NULL RETURNING id',
      [keyId, appId],
    );
    if (!result.length) throw new NotFoundException();
    await this.auditService.write(
      'application.key_revoked',
      userId,
      app.organization_id,
      'application',
      appId,
      { key_id: keyId },
    );
    return { revoked: true };
  }

  async rotateKey(userId: string, appId: string, keyId: string) {
    const app = await this.get(userId, appId);
    await this.tenancyService.membership(userId, app.organization_id, [
      'owner',
      'admin',
    ]);
    const token = `vgl_${randomToken(36)}`;
    const result = await this.databaseService.tx(async (client) => {
      const current = await client.query<{
        scopes: string[];
        expires_at: Date | null;
      }>(
        'SELECT scopes,expires_at FROM application_keys WHERE application_id=$1 AND id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE',
        [appId, keyId],
      );
      if (!current.rowCount)
        throw new NotFoundException('Credential unavailable');
      const old = current.rows[0]!;
      const created = await client.query<{
        id: string;
        prefix: string;
        scopes: string[];
        expires_at: Date | null;
      }>(
        'INSERT INTO application_keys(application_id,token_hash,prefix,scopes,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,prefix,scopes,expires_at',
        [
          appId,
          sha256(token),
          formatApiKeyPrefix(token),
          old.scopes,
          old.expires_at,
        ],
      );
      await client.query(
        'UPDATE application_keys SET revoked_at=now() WHERE id=$1',
        [keyId],
      );
      return created.rows[0]!;
    });
    await this.auditService.write(
      'application.key_rotated',
      userId,
      app.organization_id,
      'application',
      appId,
      { revoked: keyId, new_id: result.id },
    );
    return {
      ...result,
      token,
      warning: 'The previous credential was revoked immediately',
    };
  }
}
