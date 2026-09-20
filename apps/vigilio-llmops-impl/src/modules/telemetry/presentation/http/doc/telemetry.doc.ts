import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import {
  ingestTraceSchema,
  otlpMetricsSchema,
  otlpTracesSchema,
} from '../dto/trace.dto';

export function registerTelemetryDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/ingest/traces',
    method: 'post',
    summary: 'Direct application trace ingest',
    tags: ['Telemetry'],
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      schema: ingestTraceSchema,
      description: 'Trace event with redaction',
    },
    responses: { '201': { description: 'Trace ingested' } },
  });

  registerEndpointDoc({
    path: '/otlp/v1/traces',
    method: 'post',
    summary: 'OpenTelemetry OTLP/HTTP JSON trace ingest',
    tags: ['Telemetry'],
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      schema: otlpTracesSchema,
      description: 'OTLP traces payload',
    },
    responses: { '200': { description: 'OTLP spans accepted' } },
  });

  registerEndpointDoc({
    path: '/otlp/v1/metrics',
    method: 'post',
    summary: 'OpenTelemetry OTLP/HTTP JSON metrics ingest',
    tags: ['Telemetry'],
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      schema: otlpMetricsSchema,
      description: 'OTLP metrics payload',
    },
    responses: { '200': { description: 'OTLP metrics accepted' } },
  });
}
