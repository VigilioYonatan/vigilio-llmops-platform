import { expect, test } from '@playwright/test';

test('account requires an authenticated session', async ({ page }) => {
  await page.goto('/app/account');
  await expect(
    page.getByRole('button', { name: 'Iniciar sesión' }),
  ).toBeVisible();
});
test('recovery code field exists on login', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByLabel(/código de recuperación/i)).toBeVisible();
});
