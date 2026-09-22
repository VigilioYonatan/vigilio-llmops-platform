import { z } from 'zod';

export const alertRuleSchema = z
  .object({
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(3).max(100),
    metric: z.enum(['error_rate', 'latency_p95_ms', 'cost_usd']),
    comparator: z.enum(['gt', 'gte']),
    threshold: z.number().min(0).max(10000000),
    runbook_url: z.string().url().startsWith('https://'),
  })
  .strict();

export type AlertRuleRequestDto = z.infer<typeof alertRuleSchema>;

export const alertRulePatchSchema = z
  .object({
    name: z.string().trim().min(3).max(100).optional(),
    threshold: z.number().min(0).max(10000000).optional(),
    enabled: z.boolean().optional(),
    runbook_url: z.string().url().startsWith('https://').optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field to update must be provided',
  });

export type AlertRulePatchRequestDto = z.infer<typeof alertRulePatchSchema>;

export const incidentCreateSchema = z
  .object({
    workspace_id: z.string().uuid(),
    title: z.string().trim().min(4).max(200),
    severity: z.enum(['sev1', 'sev2', 'sev3']),
    summary: z.string().max(3000).optional(),
  })
  .strict();

export type IncidentCreateRequestDto = z.infer<typeof incidentCreateSchema>;

export const incidentEventSchema = z
  .object({
    message: z.string().trim().min(2).max(4000),
  })
  .strict();

export type IncidentEventRequestDto = z.infer<typeof incidentEventSchema>;

export const incidentResolveSchema = z
  .object({
    root_cause: z.string().trim().min(10).max(4000),
    corrective_action: z.string().trim().min(10).max(4000),
  })
  .strict();

export type IncidentResolveRequestDto = z.infer<typeof incidentResolveSchema>;

export const incidentRegressionSchema = z
  .object({
    dataset_id: z.string().uuid(),
    input: z.string().min(1).max(12000),
    expected_output: z.string().min(1).max(12000),
  })
  .strict();

export type IncidentRegressionRequestDto = z.infer<
  typeof incidentRegressionSchema
>;
