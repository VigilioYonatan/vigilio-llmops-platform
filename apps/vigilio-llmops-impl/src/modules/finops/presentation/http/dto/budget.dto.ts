import { z } from 'zod';

export const upsertBudgetSchema = z
  .object({
    organization_id: z.uuid(),
    limit_usd: z.string().regex(/^\d{1,8}(\.\d{1,6})?$/),
  })
  .strict();
export type UpsertBudgetRequestDto = z.infer<typeof upsertBudgetSchema>;

export const budgetCreateSchema = upsertBudgetSchema;
export type BudgetCreateDto = z.infer<typeof budgetCreateSchema>;

export const budgetPatchSchema = z
  .object({
    limit_usd: z.string().regex(/^\d{1,8}(\.\d{1,6})?$/),
  })
  .strict();
export type BudgetPatchDto = z.infer<typeof budgetPatchSchema>;

export const budgetSimulateSchema = z
  .object({
    estimated_usd: z.string().regex(/^\d{1,8}(\.\d{1,6})?$/),
  })
  .strict();
export type BudgetSimulateDto = z.infer<typeof budgetSimulateSchema>;

export const priceCardSchema = z
  .object({
    organization_id: z.uuid(),
    model: z.string().min(1).max(120),
    price_input_per_million: z.string().regex(/^\d{1,8}(\.\d{1,8})?$/),
    price_output_per_million: z.string().regex(/^\d{1,8}(\.\d{1,8})?$/),
    effective_from: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type PriceCardDto = z.infer<typeof priceCardSchema>;

export const costQuerySchema = z
  .object({
    organization_id: z.uuid(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type CostQueryDto = z.infer<typeof costQuerySchema>;
