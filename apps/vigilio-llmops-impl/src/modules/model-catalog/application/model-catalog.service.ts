import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { config } from '../../../shared/config';
import { decryptSecret, encryptSecret } from '../../../shared/crypto';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { assertSafeOutboundUrl } from '../../../shared/security/ssrf';
import { TenancyService } from '../../../shared/tenancy.service';
import { isValidFallbackPair } from '../domain/model-routing-policy';
import type {
  ModelCreateDto,
  ProviderCreateDto,
  ProviderPatchDto,
  RouteCreateDto,
  RoutePatchDto,
} from '../presentation/http/dto/model-catalog.dto';

@Injectable()
export class ModelCatalogService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async createProvider(user: string, data: ProviderCreateDto) {
    await this.tenancy.membership(user, data.organization_id, [
      'owner',
      'admin',
    ]);
    const encryptedKey = data.api_key ? encryptSecret(data.api_key) : null;
    const row = await this.db.one<{
      id: string;
      name: string;
      kind: string;
      enabled: boolean;
      has_api_key: boolean;
      created_at: Date;
    }>(
      'INSERT INTO model_providers(organization_id,name,kind,base_url,api_key_ciphertext,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,kind,enabled,(api_key_ciphertext IS NOT NULL) AS has_api_key,created_at',
      [
        data.organization_id,
        data.name,
        data.kind,
        config.ALLOWED_MODEL_BASE_URL,
        encryptedKey,
        user,
      ],
    );
    if (row) {
      await this.audit.write(
        'provider.created',
        user,
        data.organization_id,
        'provider',
        String(row.id),
      );
    }
    return row;
  }

  async providers(user: string, org: string) {
    await this.tenancy.membership(user, org);
    return this.db.rows(
      'SELECT id,name,kind,enabled,(api_key_ciphertext IS NOT NULL) AS has_api_key,created_at FROM model_providers WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',
      [org],
    );
  }

  async provider(user: string, id: string, roles?: Array<'owner' | 'admin'>) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      name: string;
      kind: string;
      enabled: boolean;
      api_key_ciphertext: string | null;
    }>(
      'SELECT id,organization_id,name,kind,enabled,api_key_ciphertext FROM model_providers WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException();
    await this.tenancy.membership(user, row.organization_id, roles);
    return row;
  }

  async patchProvider(user: string, id: string, data: ProviderPatchDto) {
    const existing = await this.provider(user, id, ['owner', 'admin']);
    const updateKey = data.api_key !== undefined;
    const nextCipher =
      data.api_key === undefined
        ? existing.api_key_ciphertext
        : data.api_key === null
          ? null
          : encryptSecret(data.api_key);
    const updated = await this.db.one(
      `UPDATE model_providers
       SET name = COALESCE($2, name),
           enabled = COALESCE($3, enabled),
           api_key_ciphertext = CASE WHEN $4::boolean THEN $5 ELSE api_key_ciphertext END
       WHERE id = $1
       RETURNING id,name,kind,enabled,(api_key_ciphertext IS NOT NULL) AS has_api_key`,
      [id, data.name ?? null, data.enabled ?? null, updateKey, nextCipher],
    );
    await this.audit.write(
      'provider.updated',
      user,
      existing.organization_id,
      'provider',
      id,
    );
    return updated;
  }

  async verifyProvider(user: string, id: string) {
    const row = await this.provider(user, id, ['owner', 'admin']);
    if (!row.enabled) throw new ConflictException('Provider disabled');
    const safeBase = await assertSafeOutboundUrl(
      config.ALLOWED_MODEL_BASE_URL,
      {
        allowLoopback: config.ALLOW_LOOPBACK_MODEL_URL === 'true',
      },
    );
    const endpoint = new URL(
      row.kind === 'ollama' ? '/api/tags' : '/v1/models',
      safeBase,
    );
    const headers: Record<string, string> = {};
    if (row.api_key_ciphertext) {
      headers.authorization = `Bearer ${decryptSecret(row.api_key_ciphertext)}`;
    }
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('Configured provider unavailable');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Configured provider health check failed',
      );
    }
    return { verified: true, provider_id: id };
  }

  async createModel(user: string, data: ModelCreateDto) {
    await this.tenancy.membership(user, data.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const provider = await this.provider(user, data.provider_id);
    if (provider.organization_id !== data.organization_id)
      throw new NotFoundException();
    return this.db.one(
      'INSERT INTO model_catalog(organization_id,provider_id,name,digest,capabilities,context_window) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,digest,capabilities,context_window,active',
      [
        data.organization_id,
        data.provider_id,
        data.name,
        data.digest,
        data.capabilities,
        data.context_window,
      ],
    );
  }

  async models(user: string, org: string) {
    await this.tenancy.membership(user, org);
    return this.db.rows(
      'SELECT m.id,m.name,m.digest,m.capabilities,m.context_window,m.active,p.name AS provider FROM model_catalog m JOIN model_providers p ON p.id=m.provider_id WHERE m.organization_id=$1 ORDER BY m.created_at DESC LIMIT 200',
      [org],
    );
  }

  async getModel(user: string, id: string) {
    const row = await this.db.one<{ id: string; organization_id: string }>(
      'SELECT id,organization_id,name,digest,capabilities,context_window,provider_id,active FROM model_catalog WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException();
    await this.tenancy.membership(user, row.organization_id);
    return row;
  }

  async createRoute(user: string, data: RouteCreateDto) {
    const app = await this.db.one<{ organization_id: string }>(
      'SELECT organization_id FROM applications WHERE id=$1 AND archived_at IS NULL',
      [data.application_id],
    );
    if (!app) throw new NotFoundException();
    await this.tenancy.membership(user, app.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    await this.ensureModels(
      app.organization_id,
      data.model_id,
      data.fallback_model_id ?? null,
    );
    const row = await this.db.one(
      'INSERT INTO model_routes(organization_id,application_id,environment,model_id,fallback_model_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(application_id,environment) DO NOTHING RETURNING id,environment,model_id,fallback_model_id',
      [
        app.organization_id,
        data.application_id,
        data.environment,
        data.model_id,
        data.fallback_model_id ?? null,
      ],
    );
    if (!row) throw new ConflictException('Model route already exists');
    return row;
  }

  async routes(user: string, appId: string) {
    const app = await this.db.one<{ organization_id: string }>(
      'SELECT organization_id FROM applications WHERE id=$1 AND archived_at IS NULL',
      [appId],
    );
    if (!app) throw new NotFoundException();
    await this.tenancy.membership(user, app.organization_id);
    return this.db.rows(
      'SELECT id,application_id,environment,model_id,fallback_model_id,updated_at FROM model_routes WHERE application_id=$1 ORDER BY environment',
      [appId],
    );
  }

  async route(
    user: string,
    id: string,
    roles?: Array<'owner' | 'admin' | 'developer'>,
  ) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      model_id: string;
      fallback_model_id: string | null;
    }>(
      'SELECT id,organization_id,model_id,fallback_model_id FROM model_routes WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException();
    await this.tenancy.membership(user, row.organization_id, roles);
    return row;
  }

  async patchRoute(user: string, id: string, data: RoutePatchDto) {
    const r = await this.route(user, id, ['owner', 'admin', 'developer']);
    await this.ensureModels(
      r.organization_id,
      data.model_id,
      data.fallback_model_id ?? null,
    );
    return this.db.one(
      'UPDATE model_routes SET model_id=$2,fallback_model_id=$3,updated_at=now() WHERE id=$1 RETURNING id,environment,model_id,fallback_model_id',
      [id, data.model_id, data.fallback_model_id ?? null],
    );
  }

  async validateRoute(user: string, id: string) {
    const r = await this.route(user, id);
    const ids = Array.from(
      new Set([r.model_id, r.fallback_model_id].filter(Boolean)),
    );
    const rows = await this.db.rows<{
      id: string;
      active: boolean;
      enabled: boolean;
    }>(
      'SELECT m.id,m.active,p.enabled FROM model_catalog m JOIN model_providers p ON p.id=m.provider_id WHERE m.id=ANY($1::uuid[]) AND m.organization_id=$2',
      [ids, r.organization_id],
    );
    const valid =
      rows.length === (r.fallback_model_id ? 2 : 1) &&
      rows.every((x) => x.active && x.enabled);
    return {
      valid,
      details: rows.map((x) => ({
        model_id: x.id,
        ready: x.active && x.enabled,
      })),
    };
  }

  private async ensureModels(
    org: string,
    primary: string,
    fallback: string | null,
  ) {
    if (!isValidFallbackPair(primary, fallback)) {
      throw new BadRequestException('Fallback must differ');
    }
    const ids = [primary, ...(fallback ? [fallback] : [])];
    const rows = await this.db.rows(
      'SELECT id FROM model_catalog WHERE organization_id=$1 AND active=true AND id=ANY($2::uuid[])',
      [org, ids],
    );
    if (rows.length !== ids.length) {
      throw new BadRequestException(
        'Models must be registered in the same organization',
      );
    }
  }
}
