import { z } from 'zod';

export const generateSchema = z
  .object({
    model: z.string().regex(/^[a-zA-Z0-9_.:\-/]{2,120}$/),
    prompt: z.string().min(1).max(20000),
    idempotency_key: z.string().uuid(),
  })
  .strict();

export type GenerateRequestDto = z.infer<typeof generateSchema>;

export const chatMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(12000),
  })
  .strict();

export const completionSchema = z
  .object({
    model: z.string().regex(/^[a-zA-Z0-9_./:-]{1,120}$/),
    messages: z.array(chatMessageSchema).min(1).max(40),
    stream: z.literal(false).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().optional(),
    top_p: z.number().min(0).max(1).optional(),
    idempotency_key: z.string().uuid().optional(),
  })
  .strict();

export type CompletionRequestDto = z.infer<typeof completionSchema>;

export const embeddingsSchema = z
  .object({
    model: z.string().regex(/^[a-zA-Z0-9_./:-]{1,120}$/),
    input: z.union([
      z.string().min(1).max(8000),
      z.array(z.string().min(1).max(8000)).min(1).max(16),
    ]),
    idempotency_key: z.string().uuid().optional(),
  })
  .strict();

export type EmbeddingsRequestDto = z.infer<typeof embeddingsSchema>;
