import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import { createReleaseSchema } from '../dto/release.dto';

export function registerReleasesDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/releases',
    method: 'post',
    summary: 'Create candidate release from passed evaluation',
    tags: ['Releases'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: createReleaseSchema,
      description: 'Release creation schema',
    },
    responses: { '201': { description: 'Draft release created' } },
  });

  registerEndpointDoc({
    path: '/api/v1/releases/{id}/approve',
    method: 'post',
    summary:
      'Approve verified release with recent MFA and separation of duties',
    tags: ['Releases'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'Release approved' } },
  });

  registerEndpointDoc({
    path: '/api/v1/releases/{id}/activate',
    method: 'post',
    summary: 'Activate approved release in target environment',
    tags: ['Releases'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'Release activated' } },
  });

  registerEndpointDoc({
    path: '/api/v1/releases/{id}/rollback',
    method: 'post',
    summary: 'Roll back active release to previous approved version',
    tags: ['Releases'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'Release rolled back' } },
  });
}
