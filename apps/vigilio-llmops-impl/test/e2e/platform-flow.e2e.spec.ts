import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseService } from '../../src/database/database.service';

let app: INestApplication;
let database: DatabaseService;
const email = `full-flow-${randomUUID()}@example.test`;
const password = 'correct-horse-battery-staple-2026';
let cookies: string[] = [];
let csrf = '';
let org_id = '';
let workspace_id = '';
let app_id = '';
let token = '';
let trace_db_id = '';
function requireTestServices() {
  process.env.TEST_DATABASE_URL ??=
    'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops_test';
  process.env.TEST_VALKEY_URL ??= 'redis://127.0.0.1:16379/15';
  process.env.TEST_NATS_URL ??= 'nats://127.0.0.1:14222';
  const db = process.env.TEST_DATABASE_URL;
  const valkey = process.env.TEST_VALKEY_URL;
  if (!db || !new URL(db).pathname.endsWith('_test'))
    throw new Error(
      'Explicit isolated TEST_DATABASE_URL ending _test required',
    );
  if (!valkey || !new URL(valkey).pathname.endsWith('/15'))
    throw new Error('Explicit isolated TEST_VALKEY_URL with /15 required');
  process.env.DATABASE_URL = db;
  process.env.VALKEY_URL = valkey;
  process.env.NATS_URL = process.env.TEST_NATS_URL;
  process.env.NODE_ENV = 'test';
  process.env.SESSION_COOKIE_SECURE = 'false';
  process.env.ENCRYPTION_KEY_B64 ??= Buffer.alloc(32, 17).toString('base64');
}
function authHeaders() {
  return { Cookie: cookies.join('; '), 'x-csrf-token': csrf };
}
beforeAll(async () => {
  requireTestServices();
  const { migrate } = await import('../../src/database/migrate');
  await migrate();
  const { AppModule } = await import('../../dist/app.module');
  const { SQL_PORT } = await import('../../dist/shared/ports/sql.port');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  database = moduleRef.get(SQL_PORT, { strict: false });
}, 45000);
afterAll(async () => {
  if (app) await app.close();
});
describe.sequential('real API and persistence vertical end-to-end', () => {
  it('registers and records a consent receipt', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        display_name: 'Flow QA',
        consent_version: 'terms-2026-11',
      });
    expect(response.status).toBe(201);
    const row = await database.one<{ id: string }>(
      'SELECT id FROM users WHERE email=$1',
      [email],
    );
    expect(row?.id).toBeTruthy();
    const consent = await database.one(
      'SELECT id FROM consent_receipts WHERE user_id=$1',
      [row?.id],
    );
    expect(consent).toBeTruthy();
  });
  it('verifies email using the encrypted outbox token without SMTP mock', async () => {
    const row = await database.one<{ payload: { token_encrypted: string } }>(
      "SELECT payload FROM outbox_events WHERE topic='email.verify' AND payload->>'email'=$1 ORDER BY created_at DESC LIMIT 1",
      [email],
    );
    expect(row).toBeTruthy();
    const { decryptSecret } = await import('../../src/shared/crypto');
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/email/verify')
      .send({ token: decryptSecret(row!.payload.token_encrypted) });
    expect(result.status).toBe(200);
    expect(result.body.verified).toBe(true);
  });
  it('signs in and emits separate session and CSRF cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(response.status).toBe(200);
    const raw = response.headers['set-cookie'] as unknown as string[];
    expect(raw.length).toBeGreaterThanOrEqual(2);
    cookies = raw.map((line) => line.split(';')[0]!);
    csrf =
      cookies
        .find((line) => line.startsWith('vigilio-csrf='))
        ?.slice('vigilio-csrf='.length) ?? '';
    expect(csrf.length).toBeGreaterThan(20);
    expect(raw.find((line) => line.startsWith('vigilio-session='))).toContain(
      'HttpOnly',
    );
  });
  it('rejects mutations without CSRF although a session exists', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Cookie', cookies.join('; '))
      .send({ name: 'Blocked', slug: 'blocked-org' });
    expect(r.status).toBe(403);
  });
  it('creates isolated org/workspace and assigns an owner', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set(authHeaders())
      .send({ name: 'LLMOps QA', slug: `qa-${randomUUID().slice(0, 8)}` });
    expect(r.status).toBe(201);
    org_id = r.body.id;
    const rows = await database.rows<{ id: string }>(
      'SELECT id FROM workspaces WHERE organization_id=$1',
      [org_id],
    );
    workspace_id = rows[0]!.id;
    expect(workspace_id).toBeTruthy();
    const members = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${org_id}/members`)
      .set('Cookie', cookies.join('; '));
    expect(members.status).toBe(200);
    expect(members.body[0].role).toBe('owner');
  });
  it('creates an application, issues a once-visible bearer key and records a trace', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set(authHeaders())
      .send({ name: 'RAG QA', workspace_id, environment: 'dev' });
    expect(created.status).toBe(201);
    app_id = created.body.id;
    const key = await request(app.getHttpServer())
      .post(`/api/v1/applications/${app_id}/keys`)
      .set(authHeaders())
      .send({ scopes: ['traces:write'], expires_in_days: 2 });
    expect(key.status).toBe(201);
    token = key.body.token;
    expect(token).toMatch(/^vgl_/);
    const ingest = await request(app.getHttpServer())
      .post('/api/v1/ingest/traces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        trace_id: `qa_${randomUUID().replaceAll('-', '')}`,
        model: 'local-test',
        status: 'success',
        latency_ms: 44,
        input_tokens: 15,
        output_tokens: 7,
        estimated_cost_usd: 0,
        attributes: { source: 'test' },
      });
    expect(ingest.status).toBe(201);
    trace_db_id = ingest.body.id;
    const trace = await request(app.getHttpServer())
      .get(`/api/v1/traces/${trace_db_id}`)
      .set('Cookie', cookies.join('; '));
    expect(trace.status).toBe(200);
    expect(trace.body.latency_ms).toBe(44);
  });
  it('revokes an API key so it no longer accesses ingestion', async () => {
    const keys = await request(app.getHttpServer())
      .get(`/api/v1/applications/${app_id}/keys`)
      .set('Cookie', cookies.join('; '));
    expect(keys.status).toBe(200);
    const id = keys.body[0]?.id;
    expect(id).toBeTruthy();
    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/applications/${app_id}/keys/${id}`)
      .set(authHeaders());
    expect(removed.status).toBe(200);
    const denied = await request(app.getHttpServer())
      .post('/api/v1/ingest/traces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        trace_id: 'qa_revoked1234',
        model: 'test',
        status: 'success',
        latency_ms: 0,
      });
    expect(denied.status).toBe(403);
  });
});
