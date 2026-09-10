import { z } from 'zod';

export const createPromptSchema = z
  .object({
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    description: z.string().max(1000).optional(),
  })
  .strict();

export type CreatePromptRequestDto = z.infer<typeof createPromptSchema>;

export const createPromptVersionSchema = z
  .object({
    template: z.string().min(1).max(50000),
    model: z.string().min(1).max(120),
    parameters: z
      .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
      .default({}),
  })
  .strict();

export type CreatePromptVersionRequestDto = z.infer<
  typeof createPromptVersionSchema
>;

export const appPromptSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().max(1000).optional(),
  })
  .strict();

export type AppPromptRequestDto = z.infer<typeof appPromptSchema>;

export const diffSchema = z
  .object({
    from_version_id: z.string().uuid(),
    to_version_id: z.string().uuid(),
  })
  .strict();

export type DiffRequestDto = z.infer<typeof diffSchema>;

export const aliasSchema = z
  .object({
    prompt_version_id: z.string().uuid(),
  })
  .strict();

export type AliasRequestDto = z.infer<typeof aliasSchema>;

export const playgroundSchema = z
  .object({
    input: z.string().min(1).max(8000),
    variables: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type PlaygroundRequestDto = z.infer<typeof playgroundSchema>;
