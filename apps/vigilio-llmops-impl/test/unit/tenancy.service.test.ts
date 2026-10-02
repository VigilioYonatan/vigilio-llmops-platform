import { describe, expect, it, vi } from 'vitest';
import { TenancyService } from '../../src/shared/tenancy.service';

describe('tenant authorization', () => {
  it('returns 404 for absent membership instead of leaking another tenant', async () => {
    const database = { one: vi.fn().mockResolvedValue(null) };
    const tenancy = new TenancyService(database as never);
    await expect(tenancy.membership('user-a', 'org-b')).rejects.toThrow();
    expect(database.one).toHaveBeenCalledWith(
      expect.stringContaining('user_id=$1 AND organization_id=$2'),
      ['user-a', 'org-b'],
    );
  });
  it('rejects privilege escalation', async () => {
    const database = { one: vi.fn().mockResolvedValue({ role: 'viewer' }) };
    const tenancy = new TenancyService(database as never);
    await expect(
      tenancy.membership('user', 'org', ['owner']),
    ).rejects.toThrow();
  });
  it('permits authorized role', async () => {
    const database = { one: vi.fn().mockResolvedValue({ role: 'developer' }) };
    const tenancy = new TenancyService(database as never);
    expect(await tenancy.membership('user', 'org', ['developer'])).toBe(
      'developer',
    );
  });
});
