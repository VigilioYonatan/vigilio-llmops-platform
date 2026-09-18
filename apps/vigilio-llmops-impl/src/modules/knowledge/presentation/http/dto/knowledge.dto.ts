import { z } from 'zod';

export const createKbSchema = z
  .object({
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(3).max(120),
  })
  .strict();

export type CreateKbRequestDto = z.infer<typeof createKbSchema>;

export const documentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().min(10).max(100000),
    visibility: z.enum(['workspace', 'restricted']).default('workspace'),
  })
  .strict();

export type DocumentRequestDto = z.infer<typeof documentSchema>;

export const aclSchema = z
  .object({
    visibility: z.enum(['workspace', 'restricted']),
    allowed_user_ids: z.array(z.string().uuid()).optional(),
    allowed_roles: z
      .array(
        z.enum([
          'owner',
          'admin',
          'developer',
          'approver',
          'analyst',
          'viewer',
        ]),
      )
      .optional(),
  })
  .strict();

export type AclRequestDto = z.infer<typeof aclSchema>;

export const searchSchema = z
  .object({
    query: z.string().trim().min(2).max(500),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();

export type SearchRequestDto = z.infer<typeof searchSchema>;

export const answerSchema = z
  .object({
    question: z.string().trim().min(3).max(2000),
    model: z.string().regex(/^[a-zA-Z0-9_./:-]{1,120}$/),
  })
  .strict();

export type AnswerRequestDto = z.infer<typeof answerSchema>;
