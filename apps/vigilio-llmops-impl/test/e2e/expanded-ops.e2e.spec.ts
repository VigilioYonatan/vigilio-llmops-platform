import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseService } from '../../src/database/database.service';

/** Real isolated Postgres E2E: no mocked controllers, DTOs or tenancy filters. */
let app: INestApplication;
let db: DatabaseService;
const email = `expanded-${randomUUID()}@example.test`;
const password = 'expanded-test-password-2026!';
let cookies: string[] = [];
let csrf = '';
let org = '';
let ws = '';
let application = '';
let dataset = '';
let prompt = '';
let promptVersion = '';
let provider = '';
let model = '';
let kb = '';
const _alertId = '';
let incidentId = '';
function ensureIsolated() {
  process.env.TEST_DATABASE_URL ??=
    'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops_test';
  process.env.TEST_VALKEY_URL ??= 'redis://127.0.0.1:16379/15';
  process.env.TEST_NATS_URL ??= 'nats://127.0.0.1:14222';
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Requires TEST_DATABASE_URL with isolated _test DB');
  if (
    !process.env.TEST_VALKEY_URL ||
    !new URL(process.env.TEST_VALKEY_URL).pathname.endsWith('/15')
  )
    throw new Error('Requires isolated TEST_VALKEY_URL db/15');
  process.env.DATABASE_URL = url;
  process.env.VALKEY_URL = process.env.TEST_VALKEY_URL;
  process.env.NATS_URL = process.env.TEST_NATS_URL;
  process.env.NODE_ENV = 'test';
  process.env.SESSION_COOKIE_SECURE = 'false';
  process.env.ENCRYPTION_KEY_B64 ??= Buffer.alloc(32, 17).toString('base64');
}
const get = (path: string) =>
  request(app.getHttpServer())
    .get(`/api/v1${path}`)
    .set('Cookie', cookies.join('; '));
const post = (path: string, body?: string | object) =>
  request(app.getHttpServer())
    .post(`/api/v1${path}`)
    .set('Cookie', cookies.join('; '))
    .set('x-csrf-token', csrf)
    .send(body);
const patch = (path: string, body?: string | object) =>
  request(app.getHttpServer())
    .patch(`/api/v1${path}`)
    .set('Cookie', cookies.join('; '))
    .set('x-csrf-token', csrf)
    .send(body);
beforeAll(async () => {
  ensureIsolated();
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
  db = moduleRef.get(SQL_PORT, { strict: false });
  const register = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      display_name: 'Expanded E2E',
      consent_version: 'terms-2026-11',
    });
  expect(register.status).toBe(201);
  const encrypted = await db.one<{ payload: { token_encrypted: string } }>(
    "SELECT payload FROM outbox_events WHERE topic='email.verify' AND payload->>'email'=$1 ORDER BY created_at DESC LIMIT 1",
    [email],
  );
  const { decryptSecret } = await import('../../src/shared/crypto');
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/email/verify')
    .send({ token: decryptSecret(encrypted!.payload.token_encrypted) });
  expect(verified.status).toBe(200);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(login.status).toBe(200);
  cookies = (login.headers['set-cookie'] as unknown as string[]).map(
    (line) => line.split(';')[0]!,
  );
  csrf =
    cookies.find((value) => value.startsWith('vigilio-csrf='))?.split('=')[1] ??
    '';
  expect(csrf.length).toBeGreaterThan(16);
  const created = await post('/organizations', {
    name: 'Expanded Quality QA',
    slug: `expanded-${randomUUID().slice(0, 8)}`,
  });
  expect(created.status).toBe(201);
  org = created.body.id;
  const workspace = await db.one<{ id: string }>(
    'SELECT id FROM workspaces WHERE organization_id=$1',
    [org],
  );
  ws = workspace!.id;
}, 60000);
afterAll(async () => {
  if (app) await app.close();
});
describe.sequential('expanded platform APIs with real DB tenant context', () => {
  it('creates and lists a model provider without accepting caller-controlled URLs', async () => {
    const created = await post('/providers', {
      organization_id: org,
      name: 'E2E local provider',
      kind: 'ollama',
    });
    expect(created.status).toBe(201);
    provider = created.body.id;
    const invalid = await post('/providers', {
      organization_id: org,
      name: 'dangerous',
      kind: 'ollama',
      base_url: 'http://127.0.0.1:1234',
    });
    expect(invalid.status).toBe(400);
    const found = await get(`/providers?organization_id=${org}`);
    expect(found.status).toBe(200);
    expect(found.body.some((v: { id: string }) => v.id === provider)).toBe(
      true,
    );
  });
  it('registers model and ensures routing uses the current organization', async () => {
    const created = await post('/models', {
      organization_id: org,
      provider_id: provider,
      name: 'e2e-local-model',
      digest: 'sha256:1234567890',
      capabilities: ['chat'],
      context_window: 4096,
    });
    expect(created.status).toBe(201);
    model = created.body.id;
    const appCreated = await post('/applications', {
      name: 'E2E agent',
      workspace_id: ws,
      environment: 'dev',
    });
    expect(appCreated.status).toBe(201);
    application = appCreated.body.id;
    const configured = await post('/model-routes', {
      application_id: application,
      environment: 'dev',
      model_id: model,
    });
    expect(configured.status).toBe(201);
    const route = await get(`/model-routes?application_id=${application}`);
    expect(route.status).toBe(200);
    expect(route.body[0].model_id).toBe(model);
    const duplicate = await post('/model-routes', {
      application_id: application,
      environment: 'dev',
      model_id: model,
    });
    expect(duplicate.status).toBe(409);
  });
  it('creates scoped knowledge documents and searches the stored content', async () => {
    const created = await post('/knowledge-bases', {
      workspace_id: ws,
      name: 'QA documents',
    });
    expect(created.status).toBe(201);
    kb = created.body.id;
    const doc = await post(`/knowledge-bases/${kb}/documents`, {
      title: 'Vacation policy',
      content:
        'Our employees are entitled to twenty five days of annual leave.',
      visibility: 'workspace',
    });
    expect(doc.status).toBe(201);
    const search = await post(`/knowledge-bases/${kb}/search`, {
      query: 'annual leave',
      limit: 5,
    });
    expect(search.status).toBe(201);
    expect(search.body.length).toBeGreaterThan(0);
    expect(search.body[0].title).toBe('Vacation policy');
    const list = await get(`/knowledge-bases?workspace_id=${ws}`);
    expect(list.status).toBe(200);
    expect(list.body.some((v: { id: string }) => v.id === kb)).toBe(true);
  });
  it('creates an alert rule, incident, event and resolves with corrective action', async () => {
    const rule = await post('/alert-rules', {
      workspace_id: ws,
      name: 'Error rate guard',
      metric: 'error_rate',
      comparator: 'gt',
      threshold: 0.1,
      runbook_url: 'https://example.com/runbooks/errors',
    });
    expect(rule.status).toBe(201);
    const list = await get(`/alert-rules?workspace_id=${ws}`);
    expect(list.status).toBe(200);
    expect(list.body.some((v: { id: string }) => v.id === rule.body.id)).toBe(
      true,
    );
    const incident = await post('/incidents', {
      workspace_id: ws,
      title: 'Regional retrieval failure',
      severity: 'sev2',
    });
    expect(incident.status).toBe(201);
    incidentId = incident.body.id;
    const event = await post(`/incidents/${incidentId}/events`, {
      message: 'Restored DB connectivity',
    });
    expect(event.status).toBe(201);
    const timeline = await get(`/incidents/${incidentId}`);
    expect(timeline.status).toBe(200);
    expect(
      timeline.body.timeline.some((v: { message: string }) =>
        v.message.includes('connectivity'),
      ),
    ).toBe(true);
    const resolved = await post(`/incidents/${incidentId}/resolve`, {
      root_cause: 'PostgreSQL network interrupted',
      corrective_action: 'Reconfigure network path and add alert',
    });
    expect(resolved.status).toBe(201);
    expect(resolved.body.id).toBe(incidentId);
  });
  it('issues an auditable privacy request without falsely marking it fulfilled', async () => {
    const privacy = await post('/data-requests/export', {
      reason: 'Data portability QA',
    });
    expect(privacy.status).toBe(201);
    expect(privacy.body.status).toBe('requires_review');
    const lookup = await get(`/data-requests/${privacy.body.id}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.status).toBe('requires_review');
    const logs = await get(`/audit-events?organization_id=${org}&limit=50`);
    expect(logs.status).toBe(200);
  });
  it('freezes a dataset and pins the queued evaluation to an immutable version', async () => {
    const ds = await post('/datasets', {
      workspace_id: ws,
      name: 'E2E baseline dataset',
    });
    expect(ds.status).toBe(201);
    dataset = ds.body.id;
    const c = await post(`/datasets/${dataset}/cases`, {
      input: 'ping',
      expected_output: 'pong',
    });
    expect(c.status).toBe(201);
    const p = await post('/prompts', {
      workspace_id: ws,
      name: `QA prompt ${randomUUID().slice(0, 8)}`,
    });
    expect(p.status).toBe(201);
    prompt = p.body.id;
    const v = await post(`/prompts/${prompt}/versions`, {
      template: '{{input}}',
      model: 'e2e-local-model',
      parameters: {},
    });
    expect(v.status).toBe(201);
    promptVersion = v.body.id;
    const first = await post('/evaluation-runs', {
      workspace_id: ws,
      dataset_id: dataset,
      prompt_version_id: promptVersion,
    });
    expect(first.status).toBe(201);
    expect(first.body.dataset_version_id).toBeTruthy();
    const row = await db.one<{ dataset_version_id: string }>(
      'SELECT dataset_version_id FROM evaluation_runs WHERE id=$1',
      [first.body.id],
    );
    expect(row?.dataset_version_id).toBe(first.body.dataset_version_id);
    const changed = await patch(
      `/datasets/${dataset}/draft/cases/${c.body.id}`,
      { expected_output: 'changed' },
    );
    expect(changed.status).toBe(200);
    const second = await post('/evaluation-runs', {
      workspace_id: ws,
      dataset_id: dataset,
      prompt_version_id: promptVersion,
    });
    expect(second.status).toBe(201);
    expect(first.body.dataset_version_id).not.toBe(
      second.body.dataset_version_id,
    );
  });
  it('rejects cross-organization access by an unrelated user', async () => {
    const secondEmail = `isolated-${randomUUID()}@example.test`;
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: secondEmail,
      password,
      display_name: 'Isolated User',
      consent_version: 'terms-2026-11',
    });
    const row = await db.one<{ payload: { token_encrypted: string } }>(
      "SELECT payload FROM outbox_events WHERE topic='email.verify' AND payload->>'email'=$1 ORDER BY created_at DESC LIMIT 1",
      [secondEmail],
    );
    const { decryptSecret } = await import('../../src/shared/crypto');
    await request(app.getHttpServer())
      .post('/api/v1/auth/email/verify')
      .send({ token: decryptSecret(row!.payload.token_encrypted) });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: secondEmail, password });
    const secondCookies = (login.headers['set-cookie'] as unknown as string[])
      .map((line) => line.split(';')[0]!)
      .join('; ');
    const providerList = await request(app.getHttpServer())
      .get(`/api/v1/providers?organization_id=${org}`)
      .set('Cookie', secondCookies);
    expect([403, 404]).toContain(providerList.status);
    const knowledgeDocs = await request(app.getHttpServer())
      .get(`/api/v1/knowledge-bases/${kb}/documents`)
      .set('Cookie', secondCookies);
    expect([403, 404]).toContain(knowledgeDocs.status);
    const modelDetails = await request(app.getHttpServer())
      .get(`/api/v1/models/${model}`)
      .set('Cookie', secondCookies);
    expect([403, 404]).toContain(modelDetails.status);
  });
});
