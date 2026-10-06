import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let app: INestApplication;
beforeAll(async () => {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops_test';
  process.env.DATABASE_URL = url;
  process.env.VALKEY_URL ??=
    process.env.TEST_VALKEY_URL ?? 'redis://127.0.0.1:16379/15';
  process.env.NATS_URL ??=
    process.env.TEST_NATS_URL ?? 'nats://127.0.0.1:14222';
  process.env.SESSION_COOKIE_SECURE ??= 'false';
  process.env.NODE_ENV = 'test';
  const { AppModule } = await import('../../dist/app.module');
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  await app.init();
});
afterAll(async () => {
  if (app) await app.close();
});
describe('Nest HTTP API', () => {
  it('responds to liveness', async () => {
    const result = await request(app.getHttpServer()).get('/health/live');
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('ok');
  });
  it('denies anonymous tenant listing', async () => {
    const result = await request(app.getHttpServer()).get(
      '/api/v1/organizations',
    );
    expect(result.status).toBe(401);
  });
  it('denies trace ingest with missing key', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/ingest/traces')
      .send({});
    expect(result.status).toBe(401);
  });
});
