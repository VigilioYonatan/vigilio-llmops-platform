export interface TraceRecord {
  id: string;
  application_id: string;
  organization_id: string;
  workspace_id: string;
  trace_id: string;
  model: string;
  status: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  attributes: Record<string, unknown>;
  created_at: Date;
}

export const TELEMETRY_REPOSITORY = Symbol('TELEMETRY_REPOSITORY');

export interface TelemetryRepository {
  findById(id: string): Promise<TraceRecord | null>;
  listByWorkspace(workspaceId: string, limit: number): Promise<TraceRecord[]>;
}
