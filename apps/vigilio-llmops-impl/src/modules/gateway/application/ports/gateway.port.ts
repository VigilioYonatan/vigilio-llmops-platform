export interface GatewayRouteRecord {
  id: string;
  name: string;
  digest: string;
  capabilities: string[];
  kind: string;
  provider_id: string;
  fallback_model_id?: string | null;
}

export interface GatewayRequestRecord {
  id: string;
  status: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  trace_id: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export const GATEWAY_REPOSITORY = Symbol('GATEWAY_REPOSITORY');

export interface GatewayRepository {
  findAuthorizedRoute(
    applicationId: string,
    organizationId: string,
    modelName: string,
    capability: string,
  ): Promise<GatewayRouteRecord | null>;
  listAllowedModels(
    applicationId: string,
    organizationId: string,
  ): Promise<GatewayRouteRecord[]>;
  createRequest(
    organizationId: string,
    applicationId: string,
    idempotencyKey: string,
    model: string,
  ): Promise<{ id: string } | null>;
  updateRequestSuccess(
    requestId: string,
    traceId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void>;
  updateRequestFailed(requestId: string): Promise<void>;
  findRequestStatus(
    applicationId: string,
    requestId: string,
  ): Promise<GatewayRequestRecord | null>;
}
