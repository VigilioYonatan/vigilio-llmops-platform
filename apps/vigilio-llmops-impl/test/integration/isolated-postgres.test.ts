import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let pool: pg.Pool;
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.includes('test'))
    throw new Error('TEST_DATABASE_URL must point to isolated *_test database');
  pool = new pg.Pool({ connectionString: url });
  await pool.query(
    readFileSync(
      join(process.cwd(), 'src/database/migrations/001_init.sql'),
      'utf8',
    ),
  );
});
afterAll(async () => {
  if (pool) await pool.end();
});
describe('PostgreSQL constraints and ownership', () => {
  it('enforces unique organization slug', async () => {
    const email = `integration-${Date.now()}@example.test`;
    const u = await pool.query<{ id: string }>(
      'INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id',
      [email, 'Integration'],
    );
    const user_id = u.rows[0]?.id;
    const slug = `unique-${Date.now()}`;
    await pool.query(
      'INSERT INTO organizations(slug,name,created_by) VALUES($1,$2,$3)',
      [slug, 'Test', user_id],
    );
    await expect(
      pool.query(
        'INSERT INTO organizations(slug,name,created_by) VALUES($1,$2,$3)',
        [slug, 'Duplicate', user_id],
      ),
    ).rejects.toThrow();
  });
  it('prevents cross-tenant workspace attachment via composite FK', async () => {
    const a = await pool.query<{ id: string }>(
      'INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id',
      [`a-${Date.now()}@example.test`, 'A'],
    );
    const owner = a.rows[0]?.id;
    const o1 = await pool.query<{ id: string }>(
      'INSERT INTO organizations(slug,name,created_by) VALUES($1,$2,$3) RETURNING id',
      [`o1-${Date.now()}`, 'A', owner],
    );
    const o2 = await pool.query<{ id: string }>(
      'INSERT INTO organizations(slug,name,created_by) VALUES($1,$2,$3) RETURNING id',
      [`o2-${Date.now()}`, 'B', owner],
    );
    const workspace = await pool.query<{ id: string }>(
      'INSERT INTO workspaces(organization_id,slug,name) VALUES($1,$2,$3) RETURNING id',
      [o1.rows[0]?.id, 'ws', 'A'],
    );
    await expect(
      pool.query(
        'INSERT INTO applications(organization_id,workspace_id,name,environment) VALUES($1,$2,$3,$4)',
        [o2.rows[0]?.id, workspace.rows[0]?.id, 'malicious', 'dev'],
      ),
    ).rejects.toThrow();
  });
});
