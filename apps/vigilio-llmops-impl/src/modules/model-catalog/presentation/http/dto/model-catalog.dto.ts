import { z } from 'zod';

// Caller-supplied base_url is strictly forbidden (anti-SSRF); optional api_key is encrypted at rest.
export const providerCreateSchema = z
  .object({
    organization_id: z.uuid(),
    name: z.string().trim().min(2).max(80),
    kind: z.enum(['ollama', 'openai-compatible']).default('ollama'),
    api_key: z.string().trim().min(8).max(512).optional(),
  })
  .strict();
export type ProviderCreateDto = z.infer<typeof providerCreateSchema>;

export const providerPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    enabled: z.boolean().optional(),
    api_key: z.string().trim().min(8).max(512).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export type ProviderPatchDto = z.infer<typeof providerPatchSchema>;

export const modelCreateSchema = z
  .object({
    organization_id: z.uuid(),
    provider_id: z.uuid(),
    name: z.string().regex(/^[a-zA-Z0-9_./:-]{1,120}$/),
    digest: z.string().min(8).max(255),
    capabilities: z
      .array(z.enum(['chat', 'embeddings']))
      .min(1)
      .max(2),
    context_window: z.number().int().min(128).max(1048576),
  })
  .strict();
export type ModelCreateDto = z.infer<typeof modelCreateSchema>;

export const routeCreateSchema = z
  .object({
    application_id: z.uuid(),
    environment: z.enum(['dev', 'staging', 'production']),
    model_id: z.uuid(),
    fallback_model_id: z.uuid().nullable().optional(),
  })
  .strict();
export type RouteCreateDto = z.infer<typeof routeCreateSchema>;

export const routePatchSchema = z
  .object({
    model_id: z.uuid(),
    fallback_model_id: z.uuid().nullable().optional(),
  })
  .strict();
export type RoutePatchDto = z.infer<typeof routePatchSchema>;
