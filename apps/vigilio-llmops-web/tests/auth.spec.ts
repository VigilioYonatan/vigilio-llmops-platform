import { expect, test } from '@playwright/test';

test('login page exposes keyboard accessible labels and Facebook fallback', async ({
  page,
}) => {
  await page.goto('/auth/login');
  await expect(
    page.getByRole('heading', { name: 'Bienvenido de nuevo' }),
  ).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Facebook Login' }),
  ).toBeVisible();
});
test('registration requires terms acceptance', async ({ page }) => {
  await page.goto('/auth/register');
  await page.getByLabel('Nombre visible').fill('A Tester');
  await page.getByLabel('Correo electrónico').fill('qa@example.test');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('very-long-test-password');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByLabel(/Acepto los términos/)).not.toBeChecked();
});
test('forgot password returns neutral form copy', async ({ page }) => {
  await page.goto('/auth/forgot');
  await expect(page.getByText(/Si existe una cuenta/)).toHaveCount(0);
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
});
