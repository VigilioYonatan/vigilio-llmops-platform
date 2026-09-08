import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import {
  completionSchema,
  embeddingsSchema,
  generateSchema,
} from '../dto/gateway.dto';

export function registerGatewayDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/gateway/generate',
    method: 'post',
    summary: 'Direct completion via model gateway',
    tags: ['Gateway'],
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      schema: generateSchema,
      description: 'Single-prompt generation payload with idempotency key',
    },
    responses: {
      '200': { description: 'Successful generation response' },
      '403': { description: 'Model route unauthorized' },
      '409': { description: 'Duplicate idempotency key' },
      '503': { description: 'Provider unavailable' },
    },
  });

  registerEndpointDoc({
    path: '/v1/chat/completions',
    method: 'post',
    summary: 'OpenAI-compatible chat completions',
    tags: ['Gateway'],
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      schema: completionSchema,
      description: 'Chat completion request compatible with OpenAI SDK',
    },
    responses: {
      '200': { description: 'OpenAI-compatible chat completion result' },
      '403': { description: 'Model disabled or route absent' },
    },
  });

  registerEndpointDoc({
    path: '/v1/embeddings',
    method: 'post',
    summary: 'OpenAI-compatible embeddings',
    tags: ['Gateway'],
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      schema: embeddingsSchema,
      description: 'Text inputs for vector embedding',
    },
    responses: {
      '200': { description: 'Vector embeddings result' },
      '403': { description: 'Embedding model unauthorized' },
    },
  });
}
