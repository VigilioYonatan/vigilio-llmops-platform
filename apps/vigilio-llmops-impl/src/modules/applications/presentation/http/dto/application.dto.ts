import { z } from 'zod';

export const appCreateSchema = z
  .object({
    workspace_id: z.uuid(),
    name: z.string().trim().min(2).max(120),
    environment: z.enum(['dev', 'staging', 'production']),
  })
  .strict();
export type AppCreateRequestDto = z.infer<typeof appCreateSchema>;

export const createScopedAppSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    environment: z.enum(['dev', 'staging', 'production']).default('dev'),
  })
  .strict();
export type CreateScopedAppDto = z.infer<typeof createScopedAppSchema>;

export const patchAppSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();
export type PatchAppDto = z.infer<typeof patchAppSchema>;

export const environmentSchema = z
  .object({
    name: z.enum(['dev', 'staging', 'production']),
  })
  .strict();
export type EnvironmentDto = z.infer<typeof environmentSchema>;

export const keyCreateSchema = z
  .object({
    scopes: z
      .array(z.enum(['traces:write', 'gateway:execute']))
      .min(1)
      .max(2),
    expires_in_days: z.number().int().min(1).max(365).default(90),
  })
  .strict();
export type KeyCreateRequestDto = z.infer<typeof keyCreateSchema>;

export const credentialSchema = keyCreateSchema;
export type CredentialDto = z.infer<typeof credentialSchema>;
