import { describe, expect, it } from 'vitest';
import { HealthController } from '../../src/shared/http/health.controller';
import type { SqlPort } from '../../src/shared/ports/sql.port';

describe('HealthController', () => {
  it('returns ok on liveness check', () => {
    const mockSql: SqlPort = {
      rows: async () => [],
      one: async () => null,
      tx: async (fn) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    };

    const controller = new HealthController(mockSql);
    const result = controller.liveness();
    expect(result).toEqual({ status: 'ok' });
  });

  it('returns ready on readiness check when db is healthy', async () => {
    const mockSql: SqlPort = {
      rows: async () => [],
      one: async () => ({ ready: 1 }) as any,
      tx: async (fn) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    };

    const controller = new HealthController(mockSql);
    const result = await controller.readiness();
    expect(result).toEqual({ status: 'ready' });
  });

  it('throws ServiceUnavailableException when db fails', async () => {
    const mockSql: SqlPort = {
      rows: async () => [],
      one: async () => {
        throw new Error('connection refused');
      },
      tx: async (fn) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    };

    const controller = new HealthController(mockSql);
    await expect(controller.readiness()).rejects.toThrow(
      'database unavailable',
    );
  });
});
