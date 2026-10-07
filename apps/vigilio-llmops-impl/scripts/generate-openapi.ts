import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.DATABASE_URL ??= 'postgresql://llmops:test@127.0.0.1:15432/llmops';
process.env.VALKEY_URL ??= 'redis://127.0.0.1:16379/0';
process.env.SESSION_SECRET ??= '01234567890123456789012345678901';
process.env.ENCRYPTION_KEY_B64 ??= Buffer.alloc(32, 1).toString('base64');
process.env.NODE_ENV ??= 'development';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { getRegisteredEndpointDocs } from '../src/shared/http/openapi-doc.registry';

async function generate(): Promise<void> {
  console.log('Starting OpenAPI generation...');
  let AppModule: any;
  try {
    // Prefer compiled dist for maximum stability and performance
    const distModule = require('../dist/app.module');
    AppModule = distModule.AppModule || distModule.default?.AppModule;
  } catch {
    const srcModule = await import('../src/app.module');
    AppModule = srcModule.AppModule || (srcModule as any).default?.AppModule;
  }
  console.log('AppModule imported.');
  let app: any;
  try {
    console.log('Creating Nest app with TestingModule...');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    console.log('Nest app created. Initializing...');
    await app.init();
    console.log('Nest app initialized.');
  } catch (e) {
    console.error('Nest init error:', e);
    process.exit(1);
  }

  const config = new DocumentBuilder()
    .setTitle('Vigilio LLMOps Platform API')
    .setDescription('Self-hosted enterprise LLMOps platform API specification')
    .setVersion('1.0.0')
    .addCookieAuth('session', {
      type: 'apiKey',
      in: 'cookie',
      name: 'vigilio_session',
      description: 'HttpOnly SameSite session cookie',
    })
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Bearer vgl_... API key',
      },
      'ApiKeyAuth',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token for system endpoints',
      },
      'BearerAuth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Merge registered Zod endpoints into OpenAPI document
  const registeredDocs = getRegisteredEndpointDocs();
  for (const doc of registeredDocs) {
    const p = doc.path;
    const m = doc.method.toLowerCase();
    if (!document.paths[p]) {
      document.paths[p] = {};
    }
    const pathItem = document.paths[p] as Record<string, unknown>;
    const op = (pathItem[m] ?? {}) as Record<string, unknown>;

    op.summary = doc.summary || op.summary;
    if (doc.description) op.description = doc.description;
    op.tags =
      doc.tags || (doc.tag ? [doc.tag] : (op.tags as string[]) || ['General']);

    if (doc.security) {
      op.security = doc.security;
    } else if (doc.auth === 'api_key') {
      op.security = [{ ApiKeyAuth: [] }];
    } else if (doc.auth === 'session') {
      op.security = [{ CookieAuth: [] }];
    } else if (doc.auth === 'public') {
      op.security = [];
    }

    // Process requestBody Zod schema if available
    let bodyZod: z.ZodType | undefined;
    let bodyDesc = 'Request body';
    if (doc.requestBody) {
      if ('schema' in doc.requestBody && doc.requestBody.schema) {
        bodyZod = doc.requestBody.schema;
        if (doc.requestBody.description) bodyDesc = doc.requestBody.description;
      } else if (doc.requestBody instanceof z.ZodType) {
        bodyZod = doc.requestBody;
      }
    }

    if (bodyZod) {
      try {
        const jsonSchema = z.toJSONSchema(bodyZod);
        op.requestBody = {
          description: bodyDesc,
          required: true,
          content: {
            'application/json': {
              schema: jsonSchema,
            },
          },
        };
      } catch {
        // Fallback if not serializable
      }
    }

    if (doc.responses) {
      op.responses = op.responses || {};
      for (const [code, r] of Object.entries(doc.responses)) {
        let respSchema: unknown;
        if (r.schema) {
          try {
            respSchema = z.toJSONSchema(r.schema);
          } catch {
            // ignore
          }
        }
        (op.responses as Record<string, unknown>)[code] = {
          description: r.description,
          ...(respSchema
            ? {
                content: {
                  'application/json': { schema: respSchema },
                },
              }
            : {}),
        };
      }
    }

    pathItem[m] = op;
  }

  // Ensure deterministic sort order
  const sortedPaths: Record<string, unknown> = {};
  for (const k of Object.keys(document.paths).sort()) {
    sortedPaths[k] = document.paths[k];
  }
  document.paths = sortedPaths as typeof document.paths;

  const outStr = `${JSON.stringify(document, null, 2)}\n`;

  mkdirSync(join(process.cwd(), 'generated'), { recursive: true });
  mkdirSync(join(process.cwd(), 'openapi'), { recursive: true });

  writeFileSync(join(process.cwd(), 'generated/openapi.json'), outStr);
  writeFileSync(join(process.cwd(), 'openapi/openapi.json'), outStr);

  await app.close();
  console.log(
    'OpenAPI document successfully generated at openapi/openapi.json and generated/openapi.json',
  );
}

generate().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
