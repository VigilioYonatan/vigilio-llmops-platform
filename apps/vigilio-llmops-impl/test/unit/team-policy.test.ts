import { describe, expect, it, vi } from 'vitest';
import { OrganizationsService } from '../../src/modules/organizations/application/organizations.service';

function harness(role: 'owner' | 'viewer' = 'owner') {
  const database = { tx: vi.fn(), one: vi.fn() };
  const tenant = {
    membership: vi
      .fn()
      .mockImplementation((_id, _org, roles: string[]) =>
        roles.includes(role)
          ? Promise.resolve(role)
          : Promise.reject(new Error('Forbidden')),
      ),
  };
  const audit = { write: vi.fn() };
  return {
    service: new OrganizationsService(
      database as never,
      tenant as never,
      audit as never,
    ),
    database,
    tenant,
    audit,
  };
}
describe('organization member privileged operations', () => {
  it('viewer cannot assign team role', async () => {
    const h = harness('viewer');
    await expect(
      h.service.changeMemberRole('viewer', 'org', 'member', 'admin'),
    ).rejects.toThrow();
    expect(h.database.one).not.toHaveBeenCalled();
  });
  it('viewer cannot remove team member', async () => {
    const h = harness('viewer');
    await expect(
      h.service.removeMember('viewer', 'org', 'member'),
    ).rejects.toThrow();
    expect(h.database.one).not.toHaveBeenCalled();
  });
  it('owner role cannot be changed by update query', async () => {
    const h = harness();
    h.database.one.mockResolvedValue(null);
    await expect(
      h.service.changeMemberRole('owner', 'org', 'member', 'admin'),
    ).rejects.toThrow();
    expect(h.database.one.mock.calls[0]?.[0]).toContain("role<>'owner'");
  });
  it('owner role cannot be removed by delete query', async () => {
    const h = harness();
    h.database.one.mockResolvedValue(null);
    await expect(
      h.service.removeMember('owner', 'org', 'member'),
    ).rejects.toThrow();
    expect(h.database.one.mock.calls[0]?.[0]).toContain("role<>'owner'");
  });
});
