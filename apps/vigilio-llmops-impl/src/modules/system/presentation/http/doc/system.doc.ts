import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';

export function registerSystemDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/system/capabilities',
    method: 'get',
    summary: 'Platform capabilities and feature flags',
    tags: ['System'],
    responses: { '200': { description: 'Self-hosted platform capabilities' } },
  });

  registerEndpointDoc({
    path: '/api/v1/system/version',
    method: 'get',
    summary: 'Platform version and build metadata',
    tags: ['System'],
    responses: { '200': { description: 'Version information' } },
  });
}
