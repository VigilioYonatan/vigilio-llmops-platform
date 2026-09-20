import { z } from 'zod';

export const ingestTraceSchema = z
  .object({
    trace_id: z.string().min(8).max(128),
    model: z.string().min(1).max(120),
    status: z.enum(['success', 'error', 'timeout']),
    latency_ms: z.number().int().nonnegative().max(3600000),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    estimated_cost_usd: z.number().nonnegative(),
    attributes: z
      .record(
        z.string().max(40),
        z.union([z.string().max(250), z.number().finite(), z.boolean()]),
      )
      .default({}),
  })
  .strict();

export type IngestTraceRequestDto = z.infer<typeof ingestTraceSchema>;

export const eventSchema = z
  .object({
    kind: z.enum([
      'task_completed',
      'task_failed',
      'user_feedback',
      'tool_called',
    ]),
    trace_id: z.string().max(128).optional(),
    attributes: z
      .record(
        z.string().max(40),
        z.union([z.string().max(250), z.number().finite(), z.boolean()]),
      )
      .default({}),
  })
  .strict();

export type EventRequestDto = z.infer<typeof eventSchema>;

export const feedbackSchema = z
  .object({
    trace_id: z.string().min(8).max(128),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  })
  .strict();

export type FeedbackRequestDto = z.infer<typeof feedbackSchema>;

export const replaySchema = z
  .object({
    dataset_id: z.string().uuid(),
    prompt_version_id: z.string().uuid(),
  })
  .strict();

export type ReplayRequestDto = z.infer<typeof replaySchema>;

const otlpAttr = z
  .object({
    key: z.string(),
    value: z
      .object({
        stringValue: z.string().optional(),
        intValue: z.string().optional(),
        boolValue: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const otlpSpan = z
  .object({
    traceId: z.string().regex(/^[0-9a-fA-F]{32}$/),
    spanId: z.string().regex(/^[0-9a-fA-F]{16}$/),
    parentSpanId: z.string().optional(),
    name: z.string().min(1).max(150),
    startTimeUnixNano: z.string().regex(/^\d+$/),
    endTimeUnixNano: z.string().regex(/^\d+$/),
    attributes: z.array(otlpAttr).max(50).optional(),
    status: z.object({ code: z.number().int().optional() }).optional(),
  })
  .passthrough();

export const otlpTracesSchema = z
  .object({
    resourceSpans: z
      .array(
        z
          .object({
            scopeSpans: z
              .array(
                z
                  .object({
                    spans: z.array(otlpSpan).max(100),
                  })
                  .passthrough(),
              )
              .max(10),
          })
          .passthrough(),
      )
      .min(1)
      .max(10),
  })
  .passthrough();

export type OtlpTracesRequestDto = z.infer<typeof otlpTracesSchema>;

export const otlpMetricsSchema = z
  .object({
    resourceMetrics: z
      .array(
        z
          .object({
            scopeMetrics: z
              .array(
                z
                  .object({
                    metrics: z
                      .array(
                        z
                          .object({
                            name: z
                              .string()
                              .regex(/^[a-zA-Z_][a-zA-Z0-9_.]{0,70}$/),
                            sum: z
                              .object({
                                dataPoints: z
                                  .array(
                                    z
                                      .object({
                                        asDouble: z
                                          .number()
                                          .finite()
                                          .optional(),
                                        asInt: z
                                          .string()
                                          .regex(/^-?\d+$/)
                                          .optional(),
                                      })
                                      .passthrough(),
                                  )
                                  .max(100),
                              })
                              .optional(),
                          })
                          .passthrough(),
                      )
                      .max(30),
                  })
                  .passthrough(),
              )
              .max(10),
          })
          .passthrough(),
      )
      .min(1)
      .max(10),
  })
  .passthrough();

export type OtlpMetricsRequestDto = z.infer<typeof otlpMetricsSchema>;
