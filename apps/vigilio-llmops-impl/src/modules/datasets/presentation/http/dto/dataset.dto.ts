import { z } from 'zod';

export const createDatasetSchema = z
  .object({
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(2).max(100),
  })
  .strict();

export type CreateDatasetRequestDto = z.infer<typeof createDatasetSchema>;

export const addDatasetCaseSchema = z
  .object({
    input: z.string().min(1).max(8000),
    expected_output: z.string().min(1).max(12000),
  })
  .strict();

export type AddDatasetCaseRequestDto = z.infer<typeof addDatasetCaseSchema>;

export const appDatasetSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
  })
  .strict();

export type AppDatasetRequestDto = z.infer<typeof appDatasetSchema>;

export const casePatchSchema = z
  .object({
    input: z.string().min(1).max(8000).optional(),
    expected_output: z.string().min(1).max(12000).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field (input or expected_output) must be provided',
  });

export type CasePatchRequestDto = z.infer<typeof casePatchSchema>;

export const datasetImportSchema = z
  .object({
    cases: z
      .array(
        z
          .object({
            input: z.string().min(1).max(8000),
            expected_output: z.string().min(1).max(12000),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();

export type DatasetImportRequestDto = z.infer<typeof datasetImportSchema>;
