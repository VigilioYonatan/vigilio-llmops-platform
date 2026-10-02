import { describe, expect, it, vi } from 'vitest';
import { DatasetLifecycleService } from '../../src/modules/datasets/application/dataset-lifecycle.service';
import { DatasetsService } from '../../src/modules/datasets/application/datasets.service';

describe('snapshot serialization', () => {
  const principal = '00000000-0000-4000-8000-000000000001';
  const id = '00000000-0000-4000-8000-000000000002';
  it('locks parent dataset before adding a case', async () => {
    const queries: string[] = [];
    const db = {
      tx: async (cb: (client: unknown) => Promise<unknown>) =>
        cb({
          query: async (sql: string) => {
            queries.push(sql);
            return { rows: [{ id: 'case' }] };
          },
        }),
    };
    const tenancy = { workspace: vi.fn(), membership: vi.fn() };
    const service = new DatasetsService(db as never, tenancy as never);
    vi.spyOn(service, 'get').mockResolvedValue({
      id,
      organization_id: id,
      workspace_id: id,
      name: 'test',
      created_at: new Date(),
    });
    await service.addCase(principal, id, {
      input: 'question',
      expected_output: 'answer',
    });
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatch(/FOR UPDATE/);
    expect(queries[1]).toMatch(/INSERT INTO dataset_cases/);
  });
  it('locks parent dataset before importing cases in bulk', async () => {
    const queries: string[] = [];
    const db = {
      one: async () => ({ id, organization_id: id, workspace_id: id }),
      tx: async (cb: (client: unknown) => Promise<unknown>) =>
        cb({
          query: async (sql: string) => {
            queries.push(sql);
            return { rows: [{ id: 'import', inserted: 1 }] };
          },
        }),
    };
    const svc = new DatasetLifecycleService(
      db as never,
      { membership: vi.fn() } as never,
      { write: vi.fn() } as never,
    );
    await svc.importCases(principal, id, {
      cases: [{ input: 'a', expected_output: 'b' }],
    });
    expect(queries[0]).toMatch(/FOR UPDATE/);
    expect(queries[1]).toMatch(/INSERT INTO dataset_cases/);
    expect(queries[2]).toMatch(/INSERT INTO dataset_imports/);
  });
});
