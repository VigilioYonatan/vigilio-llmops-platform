import { z } from 'zod';

export const evaluationRunSchema = z
  .object({
    workspace_id: z.string().uuid(),
    dataset_id: z.string().uuid(),
    prompt_version_id: z.string().uuid(),
    evaluator_version_id: z.string().uuid().optional(),
  })
  .strict();

export type EvaluationRunRequestDto = z.infer<typeof evaluationRunSchema>;

export const createEvaluatorSchema = z
  .object({
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    kind: z.enum(['exact_match', 'contains', 'regex']),
  })
  .strict();

export type CreateEvaluatorRequestDto = z.infer<typeof createEvaluatorSchema>;

export const evaluatorVersionSchema = z
  .object({
    rubric: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .default({}),
  })
  .strict();

export type EvaluatorVersionRequestDto = z.infer<typeof evaluatorVersionSchema>;

export const calibrationSchema = z
  .object({
    labels: z
      .array(
        z
          .object({
            expected: z.string().max(10000),
            actual: z.string().max(10000),
            human_passed: z.boolean(),
          })
          .strict(),
      )
      .min(2)
      .max(1000),
  })
  .strict();

export type CalibrationRequestDto = z.infer<typeof calibrationSchema>;

export const comparisonSchema = z
  .object({
    baseline_run_id: z.string().uuid(),
    candidate_run_id: z.string().uuid(),
  })
  .strict()
  .refine((v) => v.baseline_run_id !== v.candidate_run_id, {
    message: 'Baseline and candidate runs must be distinct',
  });

export type ComparisonRequestDto = z.infer<typeof comparisonSchema>;

export const annotationSchema = z
  .object({
    case_id: z.string().uuid(),
    score: z.boolean(),
    notes: z.string().trim().min(3).max(4000),
  })
  .strict();

export type AnnotationRequestDto = z.infer<typeof annotationSchema>;
