import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import { dataRequestSchema } from '../dto/governance.dto';

export function registerGovernanceDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/audit-events',
    method: 'get',
    summary: 'List immutable audit events with keyset pagination',
    tags: ['Governance'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'Audit log entries' } },
  });

  registerEndpointDoc({
    path: '/api/v1/data-requests/export',
    method: 'post',
    summary: 'Request GDPR/privacy data export',
    tags: ['Governance'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: dataRequestSchema,
      description: 'Export request reason',
    },
    responses: { '201': { description: 'Data export request queued' } },
  });

  registerEndpointDoc({
    path: '/api/v1/data-requests/delete',
    method: 'post',
    summary: 'Request GDPR/privacy data erasure',
    tags: ['Governance'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: dataRequestSchema,
      description: 'Deletion request reason',
    },
    responses: { '201': { description: 'Data deletion request queued' } },
  });
}
