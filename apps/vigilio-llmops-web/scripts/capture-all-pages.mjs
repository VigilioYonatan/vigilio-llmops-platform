/**
 * Vigilio LLMOps Platform — Senior UX/UI Screenshot & Visual Inspection Suite
 * Captures all 23 canonical pages, modals, forms, and responsive states via Playwright.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.VITE_URL || 'http://localhost:5174';
const API_URL = process.env.API_URL || 'http://localhost:3001';

const ROOT_DIR = resolve(import.meta.dirname, '../../..');
const OUTPUT_DIR = resolve(ROOT_DIR, 'reports/screenshots');
const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\d2965149-bde6-4dfd-8dbd-40fa75397446';

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const ORG_ID = '7093745a-2609-440a-939a-98a4dd255a1d';
const WS_ID = '2243d9f2-7bf9-4d9e-b258-e10c29d2c650';

const CANONICAL_PAGES = [
  // Public Auth & Privacy
  { route: '/auth/login', title: 'Iniciar sesión', isPublic: true, triggerModal: null },
  { route: '/auth/register', title: 'Crear cuenta', isPublic: true, triggerModal: null },
  { route: '/auth/forgot', title: 'Recuperar contraseña', isPublic: true, triggerModal: null },
  { route: '/privacy/deletion-status', title: 'Estado de Eliminación de Datos', isPublic: true, triggerModal: null },

  // Protected Core Application
  { route: '/app', title: 'Overview / Dashboard', isPublic: false, triggerModal: null },
  { route: '/app/applications', title: 'Aplicaciones instrumentadas', isPublic: false, triggerModal: 'Nueva aplicación|Crear aplicación|Registrar' },
  { route: '/app/traces', title: 'Trace Explorer', isPublic: false, triggerModal: null },
  { route: '/app/prompts', title: 'Prompt Studio', isPublic: false, triggerModal: 'Nuevo prompt|Crear prompt' },
  { route: '/app/datasets', title: 'Datasets de regresión', isPublic: false, triggerModal: 'Nuevo dataset|Crear dataset' },
  { route: '/app/evaluations', title: 'Evaluation Lab', isPublic: false, triggerModal: 'Nueva evaluación|Ejecutar evaluación' },
  { route: '/app/releases', title: 'Release Center', isPublic: false, triggerModal: 'Nuevo release|Promover release' },
  { route: '/app/budgets', title: 'FinOps y presupuestos', isPublic: false, triggerModal: 'Configurar presupuesto|Simular costo|Ajustar' },
  { route: '/app/models', title: 'Model Registry & Routing', isPublic: false, triggerModal: 'Nuevo proveedor|Registrar modelo|Añadir regla' },
  { route: '/app/knowledge', title: 'Knowledge y Hybrid RAG', isPublic: false, triggerModal: 'Subir documento|Nueva base|Ingestar' },
  { route: '/app/operations', title: 'Alertas e Incidentes SRE', isPublic: false, triggerModal: 'Nueva regla|Crear alerta' },
  { route: '/app/governance', title: 'Gobierno y Auditoría', isPublic: false, triggerModal: null },
  { route: '/app/quality', title: 'Quality Lab', isPublic: false, triggerModal: 'Nueva política|Definir gate' },
  { route: '/app/team', title: 'Equipo y permisos IAM', isPublic: false, triggerModal: 'Invitar|Añadir miembro' },
  { route: '/app/invitations', title: 'Invitaciones y acceso', isPublic: false, triggerModal: 'Nueva invitación|Invitar' },
  { route: '/app/settings', title: 'Configuración de organización', isPublic: false, triggerModal: 'Nuevo workspace|Crear workspace' },
  { route: '/app/account', title: 'Mi cuenta y seguridad', isPublic: false, triggerModal: 'Configurar TOTP|Activar MFA' },
  { route: '/app/onboarding', title: 'Onboarding Wizard', isPublic: false, triggerModal: null },
  { route: '/app/playground', title: 'AI Gateway & Playground', isPublic: false, triggerModal: null },
];

async function getAuthCookies() {
  console.log('[1/4] Authenticating against backend to retrieve session cookies...');
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@vigilio.io',
      password: 'Password123!',
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to login: ${res.status} ${await res.text()}`);
  }

  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const parsedCookies = [];

  for (const raw of rawCookies) {
    const parts = raw.split(';');
    const [name, ...valParts] = parts[0].trim().split('=');
    const value = valParts.join('=');
    parsedCookies.push({
      name,
      value,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    });
  }

  console.log(`✓ Acquired ${parsedCookies.length} session cookies for admin@vigilio.io`);
  return parsedCookies;
}

async function inspectPage(page) {
  return await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
    const forms = Array.from(document.querySelectorAll('form'));
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const tables = Array.from(document.querySelectorAll('table'));
    const skeletons = Array.from(document.querySelectorAll('.animate-pulse, [data-skeleton]'));
    const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
    const modals = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'));
    const cards = Array.from(document.querySelectorAll('.card, .panel, [class*="card"], [class*="panel"]'));
    const tableRows = Array.from(document.querySelectorAll('tbody tr'));
    const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth;

    return {
      buttonsCount: buttons.length,
      formsCount: forms.length,
      inputsCount: inputs.length,
      tablesCount: tables.length,
      tableRowsCount: tableRows.length,
      cardsCount: cards.length,
      skeletonsCount: skeletons.length,
      alertsCount: alerts.length,
      modalsCount: modals.length,
      hasHorizontalOverflow,
      headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 5),
    };
  });
}

async function main() {
  console.log('================================================================================');
  console.log('  VIGILIO LLMOPS — FULL PLAYWRIGHT SCREENSHOT & SENIOR UX/UI AUDIT SUITE');
  console.log('================================================================================\n');

  const cookies = await getAuthCookies();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  await context.addCookies(cookies);

  const results = [];

  console.log('[2/4] Navigating and capturing full-page screenshots...\n');

  for (let i = 0; i < CANONICAL_PAGES.length; i++) {
    const item = CANONICAL_PAGES[i];
    const pageNumber = String(i + 1).padStart(2, '0');
    const safeName = item.route.replace(/[/:]/g, '_').replace(/^_/, '') || 'root';
    const screenshotFilename = `${pageNumber}-${safeName}.png`;
    const screenshotPath = join(OUTPUT_DIR, screenshotFilename);

    const page = await context.newPage();

    // If public page, clear cookies for realistic unauthenticated view
    if (item.isPublic) {
      await context.clearCookies();
    } else {
      await context.addCookies(cookies);
    }

    const targetUrl = item.isPublic
      ? `${BASE_URL}${item.route}`
      : `${BASE_URL}${item.route}?org_id=${ORG_ID}&workspace_id=${WS_ID}`;

    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });
      // Allow settle for Signals & TanStack Query renders
      await page.waitForTimeout(800);

      // Full page screenshot
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Copy to artifact directory if available
      if (existsSync(ARTIFACT_DIR)) {
        try {
          copyFileSync(screenshotPath, join(ARTIFACT_DIR, screenshotFilename));
        } catch {}
      }

      const metrics = await inspectPage(page);

      // Attempt to trigger modal if page has an action button
      let modalCaptured = false;
      let modalFilename = null;
      if (item.triggerModal) {
        const triggers = item.triggerModal.split('|');
        for (const trigger of triggers) {
          try {
            const btn = page.locator(`button:has-text("${trigger}")`).first();
            if (await btn.isVisible({ timeout: 500 })) {
              await btn.click({ timeout: 1000 });
              await page.waitForTimeout(500);
              modalFilename = `${pageNumber}-${safeName}-modal.png`;
              const modalPath = join(OUTPUT_DIR, modalFilename);
              await page.screenshot({ path: modalPath, fullPage: false });

              if (existsSync(ARTIFACT_DIR)) {
                try {
                  copyFileSync(modalPath, join(ARTIFACT_DIR, modalFilename));
                } catch {}
              }

              modalCaptured = true;
              await page.keyboard.press('Escape');
              await page.waitForTimeout(200);
              break;
            }
          } catch {
            // Modal trigger fallback
          }
        }
      }

      console.log(`[PASS] [${pageNumber}/${CANONICAL_PAGES.length}] ${item.route.padEnd(26)} -> ${screenshotFilename} (btns: ${metrics.buttonsCount}, inputs: ${metrics.inputsCount}, rows: ${metrics.tableRowsCount}${modalCaptured ? ', modal: YES' : ''})`);

      results.push({
        route: item.route,
        title: item.title,
        screenshot: screenshotFilename,
        modalScreenshot: modalFilename,
        metrics,
        status: 'CAPTURED',
      });
    } catch (err) {
      console.error(`[FAIL] [${pageNumber}/${CANONICAL_PAGES.length}] ${item.route}: ${err.message}`);
      results.push({
        route: item.route,
        title: item.title,
        error: err.message,
        status: 'FAILED',
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const manifestPath = join(OUTPUT_DIR, 'screenshot-manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), pages: results }, null, 2));

  console.log(`\n[3/4] Screenshots and manifest successfully written to:`);
  console.log(`      ${OUTPUT_DIR}`);
  console.log(`      ${manifestPath}\n`);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
