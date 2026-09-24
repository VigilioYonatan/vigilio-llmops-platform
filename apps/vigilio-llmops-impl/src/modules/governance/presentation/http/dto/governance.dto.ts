import { z } from 'zod';

export const dataRequestSchema = z
  .object({
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export type DataRequestDto = z.infer<typeof dataRequestSchema>;

export const auditListSchema = z
  .object({
    organization_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.coerce.number().int().positive().optional(),
  })
  .strict();

export type AuditListDto = z.infer<typeof auditListSchema>;
