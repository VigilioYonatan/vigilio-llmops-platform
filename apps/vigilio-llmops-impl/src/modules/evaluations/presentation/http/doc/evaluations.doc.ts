import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import {
  comparisonSchema,
  createEvaluatorSchema,
  evaluationRunSchema,
} from '../dto/evaluation.dto';

export function registerEvaluationsDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/evaluation-runs',
    method: 'post',
    summary: 'Queue new evaluation run',
    tags: ['Evaluations'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: evaluationRunSchema,
      description: 'Evaluation run specification',
    },
    responses: { '201': { description: 'Evaluation run queued' } },
  });

  registerEndpointDoc({
    path: '/api/v1/evaluation-runs',
    method: 'get',
    summary: 'List evaluation runs',
    tags: ['Evaluations'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'List of runs' } },
  });

  registerEndpointDoc({
    path: '/api/v1/evaluators',
    method: 'post',
    summary: 'Create custom evaluator',
    tags: ['Evaluations'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: createEvaluatorSchema,
      description: 'Evaluator definition',
    },
    responses: { '201': { description: 'Evaluator created' } },
  });

  registerEndpointDoc({
    path: '/api/v1/evaluation-comparisons',
    method: 'post',
    summary: 'Compare baseline and candidate evaluation runs',
    tags: ['Evaluations'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: comparisonSchema,
      description: 'Comparison runs IDs',
    },
    responses: { '201': { description: 'Comparison recorded' } },
  });
}
