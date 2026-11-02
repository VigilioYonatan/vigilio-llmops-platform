import { expect, test } from '@playwright/test';

/** Browser contract test with explicitly mocked API; does NOT replace real backend E2E. */
const ORG = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';
const APP = '33333333-3333-4333-8333-333333333333';
function navigateUrl(section: string) {
  return `${section}?org_id=${ORG}&workspace_id=${WS}`;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const data: unknown =
      path === '/api/v1/me'
        ? {
            id: 'user-qa',
            email: 'qa@example.test',
            display_name: 'Quality User',
            email_verified: true,
          }
        : path === '/api/v1/organizations'
          ? [{ id: ORG, name: 'Quality Org', slug: 'quality-org' }]
          : path === `/api/v1/organizations/${ORG}/workspaces`
            ? [{ id: WS, name: 'Engineering', slug: 'eng' }]
            : path === '/api/v1/applications'
              ? [{ id: APP, name: 'QA agent', environment: 'dev' }]
              : path === '/api/v1/providers'
                ? []
                : path === '/api/v1/models'
                  ? []
                  : path === '/api/v1/model-routes'
                    ? []
                    : path === '/api/v1/alert-rules'
                      ? []
                      : path === '/api/v1/alerts'
                        ? []
                        : path === '/api/v1/incidents'
                          ? []
                          : path === '/api/v1/knowledge-bases'
                            ? []
                            : path === '/api/v1/evaluators'
                              ? []
                              : path === '/api/v1/audit-events'
                                ? []
                                : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
});
for (const [path, heading] of [
  ['/app/models', 'Proveedores, modelos y routing'],
  ['/app/operations', 'Alertas e incidentes'],
  ['/app/knowledge', 'Knowledge y búsqueda documental'],
  ['/app/quality', 'Evaluadores y comparaciones'],
  ['/app/governance', 'Auditoría y privacidad'],
  ['/app/invitations', 'Invitaciones y acceso'],
] as const) {
  test(`new feature navigation ${path} renders a connected page`, async ({
    page,
  }) => {
    await page.goto(navigateUrl(path));
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('form').first()).toBeVisible();
  });
}
test('model create sends a schema-conformant payload without caller-defined URL', async ({
  page,
}) => {
  let captured: unknown;
  await page.route('**/api/v1/providers', async (route) => {
    if (route.request().method() === 'POST') {
      captured = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'new-provider' }),
      });
    } else
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
  });
  await page.goto(navigateUrl('/app/models'));
  await page
    .getByRole('textbox', { name: 'Nombre del proveedor' })
    .fill('Local Ollama');
  await page.getByRole('button', { name: 'Registrar proveedor' }).click();
  await expect
    .poll(() => captured)
    .toMatchObject({
      organization_id: ORG,
      name: 'Local Ollama',
      kind: 'ollama',
    });
  expect(captured).not.toHaveProperty('base_url');
});
test('an MFA challenge must be completed before opening the workspace', async ({
  page,
}) => {
  let completed = false;
  await page.route('**/api/v1/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mfa_required: true,
        challenge_token: 'test-challenge-with-more-than-24-chars',
      }),
    }),
  );
  await page.route('**/api/v1/auth/mfa/complete', async (route) => {
    const body = route.request().postDataJSON() as {
      challenge_token: string;
      totp: string;
    };
    expect(body.challenge_token).toContain('test-challenge');
    expect(body.totp).toBe('123456');
    completed = true;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'user-qa' } }),
    });
  });
  await page.goto('/auth/login');
  await page.getByLabel('Correo electrónico').fill('qa@example.test');
  await page.getByLabel('Contraseña').fill('correct-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(
    page.getByRole('button', { name: 'Completar segundo factor' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/auth\/login/);
  await page.getByLabel('Código MFA (si está activado)').fill('123456');
  await page.getByRole('button', { name: 'Completar segundo factor' }).click();
  await expect.poll(() => completed).toBe(true);
  await expect(page).toHaveURL(/\/app/);
});
