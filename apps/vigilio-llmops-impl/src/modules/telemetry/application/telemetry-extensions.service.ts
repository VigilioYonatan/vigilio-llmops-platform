import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { RateLimitService } from '../../../shared/security/rate-limit.service';
import { TenancyService } from '../../../shared/tenancy.service';
import { EvaluationsService } from '../../evaluations/application/evaluations.service';
import { nanoDurationMs, safeAttributes } from '../domain/redaction';
import type {
  EventRequestDto,
  FeedbackRequestDto,
  OtlpMetricsRequestDto,
  OtlpTracesRequestDto,
  ReplayRequestDto,
} from '../presentation/http/dto/trace.dto';

interface AppScope {
  id: string;
  organization_id: string;
  workspace_id: string;
}

@Injectable()
export class TelemetryExtensionsService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly evaluations: EvaluationsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async sdkEvent(app: AppScope, b: EventRequestDto) {
    await this.rateLimit.consume(`ratelimit:sdk:${app.id}`, 300, 60);
    return this.db.one(
      'INSERT INTO sdk_events(organization_id, application_id, kind, trace_id, attributes) VALUES($1, $2, $3, $4, $5) RETURNING id, kind, created_at',
      [
        app.organization_id,
        app.id,
        b.kind,
        b.trace_id ?? null,
        safeAttributes(b.attributes),
      ],
    );
  }

  async feedback(app: AppScope, b: FeedbackRequestDto) {
    await this.rateLimit.consume(`ratelimit:feedback:${app.id}`, 120, 60);
    const trace = await this.db.one<{ id: string }>(
      'SELECT id FROM traces WHERE application_id = $1 AND trace_id = $2',
      [app.id, b.trace_id],
    );
    if (!trace) throw new NotFoundException('Trace not found');
    return this.db.one(
      'INSERT INTO trace_feedback(trace_id, rating, comment) VALUES($1, $2, $3) RETURNING id, rating, created_at',
      [trace.id, b.rating, b.comment ?? null],
    );
  }

  private async trace(user: string, id: string) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
    }>('SELECT id, organization_id, workspace_id FROM traces WHERE id = $1', [
      id,
    ]);
    if (!row) throw new NotFoundException('Trace not found');
    await this.tenancy.membership(user, row.organization_id);
    return row;
  }

  async spans(user: string, id: string) {
    await this.trace(user, id);
    return this.db.rows(
      'SELECT span_id, parent_span_id, name, duration_ms, attributes, created_at FROM trace_spans WHERE trace_id = $1 ORDER BY created_at LIMIT 500',
      [id],
    );
  }

  async traceFeedback(user: string, id: string) {
    await this.trace(user, id);
    return this.db.rows(
      'SELECT id, rating, comment, created_at FROM trace_feedback WHERE trace_id = $1 ORDER BY created_at DESC LIMIT 100',
      [id],
    );
  }

  async replay(user: string, id: string, b: ReplayRequestDto) {
    const t = await this.trace(user, id);
    const run = await this.evaluations.create(user, {
      workspace_id: t.workspace_id,
      dataset_id: b.dataset_id,
      prompt_version_id: b.prompt_version_id,
    });
    return {
      simulation: true,
      side_effects_replayed: false,
      evaluation_run: run,
      source_trace_id: id,
    };
  }

  private async app(user: string, id: string) {
    const row = await this.db.one<{ id: string; organization_id: string }>(
      'SELECT id, organization_id FROM applications WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (!row) throw new NotFoundException('Application not found');
    await this.tenancy.membership(user, row.organization_id);
    return row;
  }

  async timeseries(user: string, id: string) {
    await this.app(user, id);
    return this.db.rows(
      `SELECT date_trunc('day', created_at) AS day,
              count(*)::int AS requests,
              count(*) FILTER(WHERE status <> 'success')::int AS errors,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS latency_p95_ms,
              COALESCE(sum(input_tokens + output_tokens), 0)::bigint AS tokens
       FROM traces
       WHERE application_id = $1 AND created_at >= now() - interval '30 days'
       GROUP BY day
       ORDER BY day`,
      [id],
    );
  }

  async errors(user: string, id: string) {
    await this.app(user, id);
    return this.db.rows(
      `SELECT COALESCE(attributes->>'release_id', 'unattributed') AS release_id,
              status,
              count(*)::int AS count
       FROM traces
       WHERE application_id = $1 AND status <> 'success' AND created_at >= now() - interval '30 days'
       GROUP BY release_id, status
       ORDER BY count DESC
       LIMIT 100`,
      [id],
    );
  }

  async otlpTraces(app: AppScope, b: OtlpTracesRequestDto) {
    await this.rateLimit.consume(`ratelimit:otlp:${app.id}`, 300, 60);
    const spans = b.resourceSpans.flatMap((r) =>
      r.scopeSpans.flatMap((s) => s.spans),
    );
    if (spans.length > 300) throw new BadRequestException('Too many spans');

    const grouped = new Map<string, typeof spans>();
    for (const span of spans) {
      const list = grouped.get(span.traceId) ?? [];
      list.push(span);
      grouped.set(span.traceId, list);
    }

    return this.db.tx(async (client) => {
      let accepted = 0;
      for (const [trace_id, items] of grouped) {
        const duration = Math.max(
          ...items.map((x) =>
            nanoDurationMs(x.startTimeUnixNano, x.endTimeUnixNano),
          ),
        );
        const fail = items.some((x) => x.status?.code === 2);

        const root = await client.query<{ id: string }>(
          `INSERT INTO traces(application_id, organization_id, workspace_id, trace_id, model, status, latency_ms, attributes)
           VALUES($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)
           ON CONFLICT(application_id, trace_id)
           DO UPDATE SET latency_ms = GREATEST(traces.latency_ms, EXCLUDED.latency_ms),
                         status = CASE WHEN EXCLUDED.status = 'error' THEN 'error' ELSE traces.status END
           RETURNING id`,
          [
            app.id,
            app.organization_id,
            app.workspace_id,
            trace_id,
            'unknown',
            fail ? 'error' : 'success',
            duration,
          ],
        );

        const id = root.rows[0]?.id;
        for (const s of items) {
          const entries: Record<string, string | number | boolean> = {};
          for (const attr of s.attributes ?? []) {
            const v =
              attr.value.stringValue ??
              attr.value.intValue ??
              attr.value.boolValue;
            if (typeof v === 'string' || typeof v === 'boolean')
              entries[attr.key] = v;
          }
          await client.query(
            `INSERT INTO trace_spans(trace_id, span_id, parent_span_id, name, duration_ms, attributes)
             VALUES($1, $2, $3, $4, $5, $6)
             ON CONFLICT(trace_id, span_id) DO NOTHING`,
            [
              id,
              s.spanId,
              s.parentSpanId ?? null,
              s.name,
              nanoDurationMs(s.startTimeUnixNano, s.endTimeUnixNano),
              safeAttributes(entries),
            ],
          );
          accepted++;
        }
      }
      return {
        accepted_spans: accepted,
        trace_count: grouped.size,
        format: 'otlp-json',
        protobuf_supported: false,
      };
    });
  }

  async otlpMetrics(app: AppScope, b: OtlpMetricsRequestDto) {
    await this.rateLimit.consume(`ratelimit:otlp:${app.id}`, 300, 60);
    const data = b.resourceMetrics.flatMap((r) =>
      r.scopeMetrics.flatMap((s) =>
        s.metrics.flatMap((m) =>
          (m.sum?.dataPoints ?? []).map((v) => ({
            name: m.name,
            value: v.asDouble ?? (v.asInt ? Number(v.asInt) : Number.NaN),
          })),
        ),
      ),
    );
    if (data.length > 300) throw new BadRequestException('Too many metrics');
    const safe = data.filter(
      (x) => Number.isFinite(x.value) && Math.abs(x.value) < 1e12,
    );

    await this.db.tx(async (client) => {
      for (const metric of safe) {
        await client.query(
          'INSERT INTO metric_samples(organization_id, application_id, name, value) VALUES($1, $2, $3, $4)',
          [app.organization_id, app.id, metric.name, metric.value],
        );
      }
    });

    return { accepted: safe.length, format: 'otlp-json', aggregation: 'sum' };
  }
}
