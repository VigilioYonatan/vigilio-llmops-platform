import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { AfterAll, BeforeAll, Then, When } from '@cucumber/cucumber';
import { NestFactory } from '@nestjs/core';

let app: any;
let response: Response;
let responseBody: any;

const FB_SECRET = 'test-facebook-secret-12345';

BeforeAll(async function () {
  (this as any).timeout = 30000;
  if (process.env.BDD_API_URL) return;

  process.env.DATABASE_URL ??=
    'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops';
  process.env.VALKEY_URL ??= 'redis://127.0.0.1:16379/0';
  process.env.SESSION_SECRET ??= '01234567890123456789012345678901';
  process.env.ENCRYPTION_KEY_B64 ??= Buffer.alloc(32, 1).toString('base64');
  process.env.FACEBOOK_APP_ID ??= 'test-fb-app-id';
  process.env.FACEBOOK_APP_SECRET ??= FB_SECRET;
  process.env.NODE_ENV ??= 'test';

  const { AppModule } = require('../../../dist/app.module');
  const {
    configureHttpApp,
  } = require('../../../dist/shared/http/configure-app');

  app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  configureHttpApp(app);
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  process.env.BDD_API_URL = `http://127.0.0.1:${address.port}`;
});

AfterAll(async () => {
  if (app) {
    await app.close();
  }
});

When(
  'I request {word} {string} without credentials',
  async (method: string, path: string) => {
    const base = process.env.BDD_API_URL;
    if (!base) throw new Error('BDD_API_URL required; no server available');
    response = await fetch(new URL(path, base), {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
    });
    try {
      responseBody = await response.clone().json();
    } catch {
      responseBody = await response.clone().text();
    }
  },
);

When('Meta sends deletion request with invalid signature', async () => {
  const base = process.env.BDD_API_URL;
  response = await fetch(new URL('/api/v1/auth/facebook/data-deletion', base), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'signed_request=invalid_sig.invalid_payload',
  });
  try {
    responseBody = await response.clone().json();
  } catch {
    responseBody = await response.clone().text();
  }
});

When(
  'Meta sends valid signed deletion request for user {string}',
  async (fbUserId: string) => {
    const base = process.env.BDD_API_URL;
    const payloadObj = {
      algorithm: 'HMAC-SHA256',
      issued_at: Math.floor(Date.now() / 1000),
      user_id: fbUserId,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString(
      'base64url',
    );
    const sig = createHmac(
      'sha256',
      process.env.FACEBOOK_APP_SECRET || FB_SECRET,
    )
      .update(payloadB64)
      .digest('base64url');
    const signedRequest = `${sig}.${payloadB64}`;

    response = await fetch(
      new URL('/api/v1/auth/facebook/data-deletion', base),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `signed_request=${signedRequest}`,
      },
    );
    try {
      responseBody = await response.clone().json();
    } catch {
      responseBody = await response.clone().text();
    }
  },
);

Then('the API status should be {int}', (status: number) => {
  assert.equal(response.status, status);
});

Then('the response contains a tracking url and confirmation code', () => {
  assert(responseBody, 'Response body must exist');
  assert(responseBody.url, 'Response must contain tracking url');
  assert(
    responseBody.confirmation_code,
    'Response must contain confirmation_code',
  );
  assert(typeof responseBody.confirmation_code === 'string');
});
