import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  TelemetryRepository,
  TraceRecord,
} from '../../../application/ports/telemetry.port';

@Injectable()
export class TelemetryDrizzleRepository implements TelemetryRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async findById(id: string): Promise<TraceRecord | null> {
    const row = await this.sql.one<TraceRecord>(
      `SELECT id, application_id, organization_id, workspace_id, trace_id, model, status, latency_ms, input_tokens, output_tokens, estimated_cost_usd, attributes, created_at
       FROM traces
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async listByWorkspace(
    workspaceId: string,
    limit: number,
  ): Promise<TraceRecord[]> {
    return this.sql.rows<TraceRecord>(
      `SELECT id, application_id, organization_id, workspace_id, trace_id, model, status, latency_ms, input_tokens, output_tokens, estimated_cost_usd, attributes, created_at
       FROM traces
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [workspaceId, limit],
    );
  }
}
