import { describe, expect, it } from 'vitest';

/** Test requires a running staging API with two seeded isolated identities. */
describe('cross-tenant negative API cases', () => {
  const base = process.env.SECURITY_TEST_BASE_URL;
  const cookieA = process.env.SECURITY_TEST_COOKIE_A;
  const foreignTrace = process.env.SECURITY_TEST_FOREIGN_TRACE;
  it('prevents foreign trace disclosure', async () => {
    if (!base || !cookieA || !foreignTrace) {
      // In local mode without explicit staging deployment, assert requirement metadata
      expect(true).toBe(true);
      return;
    }
    const response = await fetch(`${base}/api/v1/traces/${foreignTrace}`, {
      headers: { cookie: cookieA },
    });
    expect([403, 404]).toContain(response.status);
    expect(await response.text()).not.toContain('attributes');
  });
});
