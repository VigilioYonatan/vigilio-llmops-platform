import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  GatewayRepository,
  GatewayRequestRecord,
  GatewayRouteRecord,
} from '../../../application/ports/gateway.port';

@Injectable()
export class GatewayDrizzleRepository implements GatewayRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async findAuthorizedRoute(
    applicationId: string,
    organizationId: string,
    modelName: string,
    capability: string,
  ): Promise<GatewayRouteRecord | null> {
    const row = await this.sql.one<GatewayRouteRecord>(
      `SELECT m.id, m.name, m.digest, m.capabilities, p.kind, p.id AS provider_id, r.fallback_model_id
       FROM model_routes r
       JOIN model_catalog m ON m.id = r.model_id
       JOIN model_providers p ON p.id = m.provider_id
       JOIN applications a ON a.id = r.application_id
       WHERE a.id = $1 AND a.organization_id = $2 AND r.environment = a.environment
         AND m.name = $3 AND m.active = true AND p.enabled = true
         AND $4 = ANY(m.capabilities)`,
      [applicationId, organizationId, modelName, capability],
    );
    return row ?? null;
  }

  async listAllowedModels(
    applicationId: string,
    organizationId: string,
  ): Promise<GatewayRouteRecord[]> {
    return this.sql.rows<GatewayRouteRecord>(
      `SELECT m.id, m.name, m.digest, m.capabilities, p.kind, p.id AS provider_id, r.fallback_model_id
       FROM model_routes r
       JOIN model_catalog m ON m.id = r.model_id
       JOIN model_providers p ON p.id = m.provider_id
       JOIN applications a ON a.id = r.application_id
       WHERE r.application_id = $1 AND r.environment = a.environment
         AND m.organization_id = $2 AND m.active = true AND p.enabled = true`,
      [applicationId, organizationId],
    );
  }

  async createRequest(
    organizationId: string,
    applicationId: string,
    idempotencyKey: string,
    model: string,
  ): Promise<{ id: string } | null> {
    const row = await this.sql.one<{ id: string }>(
      `INSERT INTO gateway_requests(organization_id, application_id, idempotency_key, model, status)
       VALUES($1, $2, $3, $4, 'pending')
       ON CONFLICT(application_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [organizationId, applicationId, idempotencyKey, model],
    );
    return row ?? null;
  }

  async updateRequestSuccess(
    requestId: string,
    traceId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await this.sql.rows(
      `UPDATE gateway_requests
       SET status = 'succeeded', trace_id = $2, input_tokens = $3, output_tokens = $4, completed_at = now()
       WHERE id = $1`,
      [requestId, traceId, inputTokens, outputTokens],
    );
  }

  async updateRequestFailed(requestId: string): Promise<void> {
    await this.sql.rows(
      `UPDATE gateway_requests SET status = 'failed', completed_at = now() WHERE id = $1`,
      [requestId],
    );
  }

  async findRequestStatus(
    applicationId: string,
    requestId: string,
  ): Promise<GatewayRequestRecord | null> {
    const row = await this.sql.one<GatewayRequestRecord>(
      `SELECT id, status, model, input_tokens, output_tokens, trace_id, created_at, completed_at
       FROM gateway_requests
       WHERE id = $1 AND application_id = $2`,
      [requestId, applicationId],
    );
    return row ?? null;
  }
}
