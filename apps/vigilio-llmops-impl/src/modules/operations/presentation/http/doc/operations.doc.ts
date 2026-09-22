import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import {
  alertRuleSchema,
  incidentCreateSchema,
  incidentResolveSchema,
} from '../dto/operations.dto';

export function registerOperationsDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/alert-rules',
    method: 'post',
    summary: 'Create operational alert rule',
    tags: ['Operations'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: alertRuleSchema,
      description: 'Alert rule definition',
    },
    responses: { '201': { description: 'Alert rule created' } },
  });

  registerEndpointDoc({
    path: '/api/v1/incidents',
    method: 'post',
    summary: 'Declare operational incident',
    tags: ['Operations'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: incidentCreateSchema,
      description: 'Incident payload',
    },
    responses: { '201': { description: 'Incident created' } },
  });

  registerEndpointDoc({
    path: '/api/v1/incidents/{incident_id}/resolve',
    method: 'post',
    summary: 'Resolve operational incident with postmortem',
    tags: ['Operations'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: incidentResolveSchema,
      description: 'Root cause and corrective action',
    },
    responses: { '200': { description: 'Incident resolved' } },
  });
}
