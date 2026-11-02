import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login form has no serious WCAG automated violations', async ({
  page,
}) => {
  await page.goto('/auth/login');
  const audit = await new AxeBuilder({ page: page as any })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    audit.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    ),
  ).toEqual([]);
});
