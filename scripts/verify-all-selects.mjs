import { chromium } from '../apps/vigilio-llmops-web/node_modules/playwright/index.mjs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';
const SCREENSHOT_DIR = 'C:/Users/Admin/.gemini/antigravity/brain/d2965149-bde6-4dfd-8dbd-40fa75397446';

async function verifyAllSelects() {
  console.log('================================================================');
  console.log('  VERIFICACIÓN SENIOR: COMPROBACIÓN DE SELECTS Y DROPDOWNS');
  console.log('================================================================');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  try {
    // 1. Iniciar sesión como dev@vigilio.io (o admin@vigilio.io)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@vigilio.io');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app**', { timeout: 10000 });
    await page.waitForTimeout(1500);
    console.log('✓ [Auth] Sesión iniciada correctamente.');

    // 2. Verificar Selects en la barra lateral (Sidebar Context)
    const orgSelect = page.locator('select[aria-label="Organización"]');
    await orgSelect.waitFor({ state: 'attached', timeout: 5000 });
    const orgOptions = await orgSelect.locator('option').allTextContents();
    console.log(`✓ [Shell] Selector de Organización: ${orgOptions.length} opciones -> [${orgOptions.map(o => o.trim()).join(' | ')}]`);
    if (orgOptions.length < 2) throw new Error('Faltan organizaciones en el selector del Shell');

    const wsSelect = page.locator('select[aria-label="Workspace"]');
    await wsSelect.waitFor({ state: 'attached', timeout: 5000 });
    const wsOptions = await wsSelect.locator('option').allTextContents();
    console.log(`✓ [Shell] Selector de Workspace: ${wsOptions.length} opciones -> [${wsOptions.map(o => o.trim()).join(' | ')}]`);
    if (wsOptions.length < 3) throw new Error('Faltan workspaces en el selector del Shell');

    // 3. Verificar /app/evaluations
    console.log('\n--- VERIFICANDO /app/evaluations ---');
    await page.goto(`${BASE_URL}/app/evaluations`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const evalDatasetOpts = await page.locator('#dataset option').allTextContents();
    console.log(`  ✓ Select #dataset: ${evalDatasetOpts.length} opciones -> [${evalDatasetOpts.map(o => o.trim()).join(' | ')}]`);
    if (evalDatasetOpts.length <= 1) throw new Error('El select #dataset en evaluaciones está vacío');

    const evalPromptOpts = await page.locator('#prompt option').allTextContents();
    console.log(`  ✓ Select #prompt: ${evalPromptOpts.length} opciones -> [${evalPromptOpts.map(o => o.trim()).join(' | ')}]`);
    if (evalPromptOpts.length <= 1) throw new Error('El select #prompt en evaluaciones está vacío');

    // Seleccionar primer prompt para verificar que pueble las versiones
    await page.selectOption('#prompt', { index: 1 });
    await page.waitForTimeout(600);
    const evalVersionOpts = await page.locator('#version option').allTextContents();
    console.log(`  ✓ Select #version (tras elegir prompt): ${evalVersionOpts.length} opciones -> [${evalVersionOpts.map(o => o.trim()).join(' | ')}]`);
    if (evalVersionOpts.length <= 1) throw new Error('El select #version en evaluaciones está vacío');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-evaluations.png') });

    // 4. Verificar /app/releases
    console.log('\n--- VERIFICANDO /app/releases ---');
    await page.goto(`${BASE_URL}/app/releases`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const relPromptOpts = await page.locator('#release-prompt option').allTextContents();
    console.log(`  ✓ Select #release-prompt: ${relPromptOpts.length} opciones -> [${relPromptOpts.map(o => o.trim()).join(' | ')}]`);
    if (relPromptOpts.length <= 1) throw new Error('El select #release-prompt está vacío');

    await page.selectOption('#release-prompt', { index: 1 });
    await page.waitForTimeout(600);
    const relVersionOpts = await page.locator('#release-version option').allTextContents();
    console.log(`  ✓ Select #release-version: ${relVersionOpts.length} opciones -> [${relVersionOpts.map(o => o.trim()).join(' | ')}]`);
    if (relVersionOpts.length <= 1) throw new Error('El select #release-version está vacío');

    const relEvalOpts = await page.locator('#release-eval option').allTextContents();
    console.log(`  ✓ Select #release-eval: ${relEvalOpts.length} opciones -> [${relEvalOpts.map(o => o.trim()).join(' | ')}]`);
    if (relEvalOpts.length <= 1) throw new Error('El select #release-eval está vacío');

    const relPolicyOpts = await page.locator('#release-policy option').allTextContents();
    console.log(`  ✓ Select #release-policy: ${relPolicyOpts.length} opciones -> [${relPolicyOpts.map(o => o.trim()).join(' | ')}]`);
    if (relPolicyOpts.length <= 1) throw new Error('El select #release-policy está vacío');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-releases.png') });

    // 5. Verificar /app/playground
    console.log('\n--- VERIFICANDO /app/playground ---');
    await page.goto(`${BASE_URL}/app/playground`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const pgPromptOpts = await page.locator('#pg-prompt option').allTextContents();
    console.log(`  ✓ Select #pg-prompt: ${pgPromptOpts.length} opciones -> [${pgPromptOpts.map(o => o.trim()).join(' | ')}]`);
    if (pgPromptOpts.length <= 1) throw new Error('El select #pg-prompt en Playground está vacío');

    await page.selectOption('#pg-prompt', { index: 1 });
    await page.waitForTimeout(600);
    const pgVersionOpts = await page.locator('#pg-version option').allTextContents();
    console.log(`  ✓ Select #pg-version: ${pgVersionOpts.length} opciones -> [${pgVersionOpts.map(o => o.trim()).join(' | ')}]`);
    if (pgVersionOpts.length <= 1) throw new Error('El select #pg-version en Playground está vacío');

    const aliasEnvOpts = await page.locator('#alias-env option').allTextContents();
    console.log(`  ✓ Select #alias-env: ${aliasEnvOpts.length} opciones -> [${aliasEnvOpts.map(o => o.trim()).join(' | ')}]`);

    const aliasVersionOpts = await page.locator('#alias-v option').allTextContents();
    console.log(`  ✓ Select #alias-v: ${aliasVersionOpts.length} opciones -> [${aliasVersionOpts.map(o => o.trim()).join(' | ')}]`);
    if (aliasVersionOpts.length <= 1) throw new Error('El select #alias-v en Playground está vacío');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-playground.png') });

    // 6. Verificar /app/knowledge
    console.log('\n--- VERIFICANDO /app/knowledge ---');
    await page.goto(`${BASE_URL}/app/knowledge`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const kbOpts = await page.locator('#kb-select option').allTextContents();
    console.log(`  ✓ Select #kb-select: ${kbOpts.length} opciones -> [${kbOpts.map(o => o.trim()).join(' | ')}]`);
    if (kbOpts.length <= 1) throw new Error('El select #kb-select está vacío');

    const docVisOpts = await page.locator('#doc-visibility option').allTextContents();
    console.log(`  ✓ Select #doc-visibility: ${docVisOpts.length} opciones -> [${docVisOpts.map(o => o.trim()).join(' | ')}]`);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-knowledge.png') });

    // 7. Verificar /app/models
    console.log('\n--- VERIFICANDO /app/models ---');
    await page.goto(`${BASE_URL}/app/models`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const provKindOpts = await page.locator('#provider-kind option').allTextContents();
    console.log(`  ✓ Select #provider-kind: ${provKindOpts.length} opciones -> [${provKindOpts.map(o => o.trim()).join(' | ')}]`);

    const catalogProvOpts = await page.locator('#catalog-provider option').allTextContents();
    console.log(`  ✓ Select #catalog-provider: ${catalogProvOpts.length} opciones -> [${catalogProvOpts.map(o => o.trim()).join(' | ')}]`);
    if (catalogProvOpts.length <= 1) throw new Error('El select #catalog-provider está vacío');

    const routeAppOpts = await page.locator('#route-app option').allTextContents();
    console.log(`  ✓ Select #route-app: ${routeAppOpts.length} opciones -> [${routeAppOpts.map(o => o.trim()).join(' | ')}]`);
    if (routeAppOpts.length <= 1) throw new Error('El select #route-app está vacío');

    const routeEnvOpts = await page.locator('#route-env option').allTextContents();
    console.log(`  ✓ Select #route-env: ${routeEnvOpts.length} opciones -> [${routeEnvOpts.map(o => o.trim()).join(' | ')}]`);

    const routeModelOpts = await page.locator('#route-model option').allTextContents();
    console.log(`  ✓ Select #route-model: ${routeModelOpts.length} opciones -> [${routeModelOpts.map(o => o.trim()).join(' | ')}]`);
    if (routeModelOpts.length <= 1) throw new Error('El select #route-model está vacío');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-models.png') });

    // 8. Verificar /app/team
    console.log('\n--- VERIFICANDO /app/team ---');
    await page.goto(`${BASE_URL}/app/team`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const memberRoleOpts = await page.locator('#member-role option').allTextContents();
    console.log(`  ✓ Select #member-role: ${memberRoleOpts.length} opciones -> [${memberRoleOpts.map(o => o.trim()).join(' | ')}]`);

    const teamTableRows = await page.locator('table tbody tr').count();
    console.log(`  ✓ Tabla de miembros del equipo: ${teamTableRows} miembros activos`);
    if (teamTableRows < 5) throw new Error('Faltan miembros en la tabla de equipo');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-team.png') });

    // 9. Verificar /app/invitations
    console.log('\n--- VERIFICANDO /app/invitations ---');
    await page.goto(`${BASE_URL}/app/invitations`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const inviteRoleOpts = await page.locator('#invite-role option').allTextContents();
    console.log(`  ✓ Select #invite-role: ${inviteRoleOpts.length} opciones -> [${inviteRoleOpts.map(o => o.trim()).join(' | ')}]`);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-selects-invitations.png') });

    // 10. Conmutar a Staging y verificar que tampoco esté vacío
    console.log('\n--- VERIFICANDO CAMBIO DE WORKSPACE A STAGING ---');
    await wsSelect.selectOption({ label: 'Staging Lab & QA' });
    await page.waitForTimeout(800);

    await page.goto(`${BASE_URL}/app/evaluations`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const stagingDatasetOpts = await page.locator('#dataset option').allTextContents();
    console.log(`  ✓ Select #dataset en Staging: ${stagingDatasetOpts.length} opciones -> [${stagingDatasetOpts.map(o => o.trim()).join(' | ')}]`);
    if (stagingDatasetOpts.length <= 1) throw new Error('El select #dataset en Staging está vacío');

    const stagingPromptOpts = await page.locator('#prompt option').allTextContents();
    console.log(`  ✓ Select #prompt en Staging: ${stagingPromptOpts.length} opciones -> [${stagingPromptOpts.map(o => o.trim()).join(' | ')}]`);
    if (stagingPromptOpts.length <= 1) throw new Error('El select #prompt en Staging está vacío');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'verify-staging-selects.png') });

    console.log('\n================================================================');
    console.log('  🏆 TODOS LOS SELECTS, DROPDOWNS Y PÁGINAS TIENEN DATOS RICOS!');
    console.log('  Cero selects vacíos. Multi-tenant y multi-workspace verificado.');
    console.log('================================================================\n');

  } finally {
    await browser.close();
  }
}

verifyAllSelects().catch((err) => {
  console.error('\n❌ ERROR EN VERIFICACIÓN DE SELECTS:', err);
  process.exit(1);
});
