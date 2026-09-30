import type { ZodType } from 'zod';

export interface EndpointDocSpec {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag?: string;
  tags?: string[];
  summary: string;
  description?: string;
  auth?: 'public' | 'session' | 'api_key' | 'metrics_token';
  security?: Array<Record<string, string[]>>;
  requestBody?:
    | {
        schema?: ZodType;
        description?: string;
      }
    | ZodType;
  responses?: Record<string, { description: string; schema?: ZodType }>;
  responseBody?: ZodType;
}

const ENDPOINT_DOCS: EndpointDocSpec[] = [];

export function registerEndpointDocs(specs: EndpointDocSpec[]): void {
  for (const spec of specs) {
    const idx = ENDPOINT_DOCS.findIndex(
      (item) => item.method === spec.method && item.path === spec.path,
    );
    if (idx >= 0) {
      ENDPOINT_DOCS[idx] = spec;
    } else {
      ENDPOINT_DOCS.push(spec);
    }
  }
}

export function registerEndpointDoc(spec: EndpointDocSpec): void {
  registerEndpointDocs([spec]);
}

export function getRegisteredEndpointDocs(): readonly EndpointDocSpec[] {
  return ENDPOINT_DOCS;
}
