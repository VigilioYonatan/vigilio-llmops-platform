import { describe, expect, it, vi } from 'vitest';
import { BudgetService } from '../../src/modules/finops/application/budget.service';
import type { SqlPort } from '../../src/shared/ports/sql.port';
import type { TenancyService } from '../../src/shared/tenancy.service';

describe('BudgetService', () => {
  const orgId = '7093745a-2609-440a-939a-98a4dd255a1d';
  const userId = '00000000-0000-4000-8000-000000000001';

  it('returns an explicit unconfigured zero budget object instead of null when no budget_policies row exists', async () => {
    const sql: Pick<SqlPort, 'one'> = {
      one: vi.fn().mockResolvedValue(null),
    };
    const tenancy: Pick<TenancyService, 'membership'> = {
      membership: vi.fn().mockResolvedValue('owner'),
    };

    const service = new BudgetService(
      sql as SqlPort,
      tenancy as TenancyService,
    );
    const result = await service.get(userId, orgId);

    expect(result).toEqual({
      organization_id: orgId,
      limit_usd: '0.000000',
      spent_usd: '0.000000',
      configured: false,
    });
  });

  it('returns configured=true when a budget_policies row exists', async () => {
    const sql: Pick<SqlPort, 'one'> = {
      one: vi.fn().mockResolvedValue({
        organization_id: orgId,
        limit_usd: '250.000000',
        spent_usd: '12.345000',
      }),
    };
    const tenancy: Pick<TenancyService, 'membership'> = {
      membership: vi.fn().mockResolvedValue('owner'),
    };

    const service = new BudgetService(
      sql as SqlPort,
      tenancy as TenancyService,
    );
    const result = await service.get(userId, orgId);

    expect(result).toEqual({
      organization_id: orgId,
      limit_usd: '250.000000',
      spent_usd: '12.345000',
      configured: true,
    });
  });
});
