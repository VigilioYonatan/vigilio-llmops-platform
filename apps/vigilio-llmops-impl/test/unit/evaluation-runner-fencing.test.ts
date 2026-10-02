import { describe, expect, it, vi } from 'vitest';
import { EvaluationsService } from '../../src/modules/evaluations/application/evaluations.service';

const RUN = '00000000-0000-4000-8000-000000000101';
const VERSION = '00000000-0000-4000-8000-000000000102';
const DATASET = '00000000-0000-4000-8000-000000000103';
const CASE = '00000000-0000-4000-8000-000000000104';

function harness(
  options: { cancel?: boolean; lostLease?: boolean; empty?: boolean } = {},
) {
  const statements: string[] = [];
  let call = 0;
  const db = {
    one: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('JOIN prompt_versions'))
        return {
          id: RUN,
          status: 'queued',
          dataset_id: DATASET,
          dataset_version_id: VERSION,
          template: '{{input}}',
          model: 'model-local',
        };
      if (
        sql.includes('SET lease_until = now()') ||
        sql.includes('SET lease_until=')
      )
        return options.lostLease ? null : { id: RUN };
      if (
        sql.includes("status='running'") ||
        sql.includes("status = 'running'")
      )
        return { id: RUN };
      return null;
    }),
    rows: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('FROM dataset_version_cases'))
        return options.empty
          ? []
          : [{ id: CASE, input: 'How?', expected_output: 'Answer' }];
      if (sql.includes('INSERT INTO evaluation_results'))
        return options.cancel ? [] : [{ id: CASE }];
      return [];
    }),
  };
  const model = {
    infer: vi.fn(async () => {
      call++;
      return { output: 'Answer' };
    }),
  };
  const svc = new EvaluationsService(db as never, {} as never, model as never);
  return { svc, db, model, statements, inferences: () => call };
}

describe('durable evaluation worker with lease fencing', () => {
  it('evaluates immutable version cases rather than live dataset', async () => {
    const h = harness();
    await h.svc.execute(RUN);
    expect(
      h.statements.some((s) => s.includes('FROM dataset_version_cases')),
    ).toBe(true);
    expect(h.statements.some((s) => s.includes('FROM dataset_cases'))).toBe(
      false,
    );
    expect(h.inferences()).toBe(1);
    expect(
      h.statements.some(
        (s) =>
          s.includes('lease_token=$6') ||
          s.includes('lease_token = $6') ||
          s.includes('lease_token = $5'),
      ),
    ).toBe(true);
  });
  it('does not call the model if its lease has expired', async () => {
    const h = harness({ lostLease: true });
    await h.svc.execute(RUN);
    expect(h.inferences()).toBe(0);
    expect(
      h.statements.some((s) => s.includes('INSERT INTO evaluation_results')),
    ).toBe(false);
  });
  it('stops writing or promoting after cancellation removes its fence', async () => {
    const h = harness({ cancel: true });
    await h.svc.execute(RUN);
    expect(h.inferences()).toBe(1);
    expect(
      h.statements.some(
        (s) => s.includes('SET status=$2') || s.includes('SET status = $2'),
      ),
    ).toBe(false);
  });
  it('marks empty pinned datasets as an error without model calls', async () => {
    const h = harness({ empty: true });
    await h.svc.execute(RUN);
    expect(h.inferences()).toBe(0);
    expect(
      h.statements.some(
        (s) => s.includes("status='error'") || s.includes("status = 'error'"),
      ),
    ).toBe(true);
  });
});
