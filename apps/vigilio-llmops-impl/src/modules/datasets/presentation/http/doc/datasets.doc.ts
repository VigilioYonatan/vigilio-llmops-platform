import { registerEndpointDoc } from '../../../../../shared/http/openapi-doc.registry';
import { createDatasetSchema, datasetImportSchema } from '../dto/dataset.dto';

export function registerDatasetsDocs(): void {
  registerEndpointDoc({
    path: '/api/v1/datasets',
    method: 'post',
    summary: 'Create dataset',
    tags: ['Datasets'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: createDatasetSchema,
      description: 'Dataset creation schema',
    },
    responses: { '201': { description: 'Dataset created' } },
  });

  registerEndpointDoc({
    path: '/api/v1/datasets',
    method: 'get',
    summary: 'List datasets in workspace',
    tags: ['Datasets'],
    security: [{ CookieAuth: [] }],
    responses: { '200': { description: 'Datasets list' } },
  });

  registerEndpointDoc({
    path: '/api/v1/datasets/{dataset_id}/versions',
    method: 'post',
    summary: 'Freeze dataset into immutable version snapshot',
    tags: ['Datasets'],
    security: [{ CookieAuth: [] }],
    responses: {
      '201': { description: 'Snapshot created with SHA-256 digest' },
    },
  });

  registerEndpointDoc({
    path: '/api/v1/datasets/{dataset_id}/imports',
    method: 'post',
    summary: 'Bulk import test cases into dataset',
    tags: ['Datasets'],
    security: [{ CookieAuth: [] }],
    requestBody: {
      schema: datasetImportSchema,
      description: 'Batch cases array',
    },
    responses: { '201': { description: 'Import job created' } },
  });
}
