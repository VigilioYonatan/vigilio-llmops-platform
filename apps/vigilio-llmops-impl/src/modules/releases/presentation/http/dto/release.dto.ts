import { z } from 'zod';

export const createPolicySchema = z
  .object({
    workspace_id: z.string().uuid(),
    name: z.string().min(2).max(120),
    minimum_score: z.number().min(0).max(1),
  })
  .strict();

export type CreatePolicyRequestDto = z.infer<typeof createPolicySchema>;

export const createReleaseSchema = z
  .object({
    workspace_id: z.string().uuid(),
    prompt_version_id: z.string().uuid(),
    evaluation_run_id: z.string().uuid(),
    policy_id: z.string().uuid(),
    environment: z.enum(['dev', 'staging', 'production']).default('production'),
  })
  .strict();

export type CreateReleaseRequestDto = z.infer<typeof createReleaseSchema>;

export const policyVersionSchema = z
  .object({
    minimum_score: z.number().min(0).max(1),
  })
  .strict();

export type PolicyVersionRequestDto = z.infer<typeof policyVersionSchema>;

export const dryRunSchema = z
  .object({
    policy_id: z.string().uuid(),
    run_id: z.string().uuid(),
  })
  .strict();

export type DryRunRequestDto = z.infer<typeof dryRunSchema>;

export const rejectSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export type RejectRequestDto = z.infer<typeof rejectSchema>;
