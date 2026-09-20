import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { RateLimitService } from '../../../shared/security/rate-limit.service';
import { TenancyService } from '../../../shared/tenancy.service';
import { safeAttributes } from '../domain/redaction';
import type { IngestTraceRequestDto } from '../presentation/http/dto/trace.dto';

interface AppScope {
  id: string;
  organization_id: string;
  workspace_id: string;
}

@Injectable()
export class TracesService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async ingest(app: AppScope, body: IngestTraceRequestDto) {
    await this.rateLimitService.consume(`ratelimit:ingest:${app.id}`, 300, 60);

    const safe = safeAttributes(body.attributes);

    return this.databaseService.tx(async (client) => {
      const inserted = await client.query<{
        id: string;
        trace_id: string;
        created_at: Date;
      }>(
        `INSERT INTO traces(application_id, organization_id, workspace_id, trace_id, model, status, latency_ms, input_tokens, output_tokens, estimated_cost_usd, attributes)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT(application_id, trace_id) DO NOTHING
         RETURNING id, trace_id, created_at`,
        [
          app.id,
          app.organization_id,
          app.workspace_id,
          body.trace_id,
          body.model,
          body.status,
          body.latency_ms,
          body.input_tokens,
          body.output_tokens,
          body.estimated_cost_usd,
          JSON.stringify(safe),
        ],
      );
      if (inserted.rowCount) {
        await client.query(
          "INSERT INTO outbox_events(topic, payload) VALUES('trace.ingested', $1)",
          [JSON.stringify({ trace_record_id: inserted.rows[0]?.id })],
        );
        return inserted.rows[0]!;
      }
      const existing = await client.query(
        'SELECT id, trace_id, created_at FROM traces WHERE application_id = $1 AND trace_id = $2',
        [app.id, body.trace_id],
      );
      return existing.rows[0]!;
    });
  }

  async list(user_id: string, workspace_id: string, limit: number) {
    await this.tenancyService.workspace(user_id, workspace_id);
    return this.databaseService.rows(
      `SELECT id, trace_id, model, status, latency_ms, input_tokens, output_tokens, estimated_cost_usd, created_at
       FROM traces
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [workspace_id, limit],
    );
  }

  async get(user_id: string, trace_id: string) {
    const row = await this.databaseService.one<{
      id: string;
      organization_id: string;
    }>(
      `SELECT id, organization_id, workspace_id, trace_id, model, status, latency_ms, input_tokens, output_tokens, estimated_cost_usd, attributes, created_at
       FROM traces
       WHERE id = $1`,
      [trace_id],
    );
    if (!row) throw new NotFoundException('Trace not found');
    await this.tenancyService.membership(user_id, row.organization_id);
    return row;
  }

  async summary(user_id: string, workspace_id: string) {
    await this.tenancyService.workspace(user_id, workspace_id);
    return this.databaseService.one(
      `SELECT COUNT(*)::int AS requests,
              COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms,
              COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd,
              COUNT(*) FILTER(WHERE status <> 'success')::int AS errors
       FROM traces
       WHERE workspace_id = $1 AND created_at > now() - interval '7 days'`,
      [workspace_id],
    );
  }
}
