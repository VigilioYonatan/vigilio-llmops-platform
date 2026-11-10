import { describe, expect, it } from 'vitest';
import { OrganizationsService } from '../../src/modules/organizations/application/organizations.service';

/** Unit-level guardrail: owner protection must remain in SQL predicates even if HTTP role guards change. */
describe('member owner immutability', () => {
  it('cannot remove organization owner', async () => {
    const database = {
      one: async (sql: string) => {
        expect(sql).toContain("role<>'owner'");
        return null;
      },
    };
    const tenancy = { membership: async () => 'owner' };
    const audit = { write: async () => undefined };
    const sut = new OrganizationsService(
      database as never,
      tenancy as never,
      audit as never,
    );
    await expect(
      sut.removeMember('user', 'org', 'protected-owner'),
    ).rejects.toThrow();
  });
});
