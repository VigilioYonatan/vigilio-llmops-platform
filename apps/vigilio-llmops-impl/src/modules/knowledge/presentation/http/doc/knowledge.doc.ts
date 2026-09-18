import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import {
  answerSchema,
  createKbSchema,
  searchSchema,
} from '../dto/knowledge.dto';

export function registerKnowledgeDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/knowledge-bases',
    method: 'post',
    summary: 'Create knowledge base',
    tags: ['Knowledge'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: createKbSchema,
      description: 'Knowledge base schema',
    },
    responses: { '201': { description: 'Knowledge base created' } },
  });

  registerEndpointDoc({
    path: '/api/v1/knowledge-bases/{kb_id}/search',
    method: 'post',
    summary:
      'Hybrid RAG search (pgvector + FTS + RRF k=60) with pre-retrieval SQL ACL',
    tags: ['Knowledge'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: searchSchema,
      description: 'Search query and limit',
    },
    responses: { '200': { description: 'Ranked fused document chunks' } },
  });

  registerEndpointDoc({
    path: '/api/v1/knowledge-bases/{kb_id}/answer',
    method: 'post',
    summary: 'Ground model inference on verified Hybrid RAG citations',
    tags: ['Knowledge'],
    security: [{ CookieAuth: [] }],
    requestBody: { schema: answerSchema, description: 'Question and model' },
    responses: {
      '200': {
        description: 'Answer with verified citations and FinOps ledger',
      },
    },
  });
}
