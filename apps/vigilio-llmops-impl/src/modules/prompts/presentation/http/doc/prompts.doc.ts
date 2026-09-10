import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import {
  createPromptSchema,
  diffSchema,
  playgroundSchema,
} from '../dto/prompt.dto';

export function registerPromptsDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/prompts',
    method: 'post',
    summary: 'Create prompt template',
    tags: ['Prompts'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: createPromptSchema,
      description: 'Prompt parameters',
    },
    responses: { '201': { description: 'Prompt created successfully' } },
  });

  registerEndpointDoc({
    path: '/api/v1/prompts',
    method: 'get',
    summary: 'List prompts in workspace',
    tags: ['Prompts'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'List of prompt templates' } },
  });

  registerEndpointDoc({
    path: '/api/v1/prompts/{prompt_id}/versions/{version_id}/playground',
    method: 'post',
    summary: 'Test prompt version with live inference playground',
    tags: ['Prompts'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: playgroundSchema,
      description: 'Test variables and input',
    },
    responses: {
      '200': { description: 'Rendered execution output and metrics' },
    },
  });

  registerEndpointDoc({
    path: '/api/v1/prompts/{prompt_id}/diff',
    method: 'post',
    summary: 'Line diff between two prompt versions',
    tags: ['Prompts'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: diffSchema,
      description: 'Two version IDs to compare',
    },
    responses: { '200': { description: 'Structured line diff output' } },
  });
}
