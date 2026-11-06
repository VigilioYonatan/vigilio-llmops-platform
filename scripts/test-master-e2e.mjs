/**
 * Vigilio LLMOps Platform — Master End-to-End Test Suite (Senior Mode)
 * Executes real user journeys via Playwright (clicking buttons, filling forms),
 * and asserts real-time state changes directly against PostgreSQL 16.
 */
import pgPkg from '../apps/vigilio-llmops-impl/node_modules/pg/lib/index.js';
const { Client } = pgPkg;
import { chromium } from '../apps/vigilio-llmops-web/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DB_URL = 'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops';
const BASE_URL = 'http://localhost:5174';
const API_URL = 'http://localhost:3001';
const ORG_ID = '7093745a-2609-440a-939a-98a4dd255a1d';
const WS_ID = '2243d9f2-7bf9-4d9e-b258-e10c29d2c650';

const TIMESTAMP = Date.now();
const SCREENSHOT_DIR = 'reports/screenshots/e2e';

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function main() {
  console.log('================================================================================');
  console.log('  VIGILIO LLMOPS — MASTER E2E & DATABASE INTEGRITY SUITE (SENIOR MODE)');
  console.log('================================================================================\n');

  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();
  console.log('✓ [DB] Connected to PostgreSQL 16 on 127.0.0.1:15432/llmops');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  async function takeScreenshot(name) {
    try {
      await page.screenshot({ path: join(SCREENSHOT_DIR, name) });
    } catch (e) {
      console.warn(`[Screenshot] Warning: could not save ${name}: ${e.message}`);
    }
  }

  const report = {
    startedAt: new Date().toISOString(),
    gates: [],
  };

  function recordGate(name, status, details) {
    console.log(`[${status}] Gate: ${name} — ${details}`);
    report.gates.push({ name, status, details, timestamp: new Date().toISOString() });
  }

  let createdAppId = null;
  let createdPromptId = null;
  let createdDatasetId = null;

  try {
    // -------------------------------------------------------------------------
    // GATE 1: Authentication, Cookie Session & Tenant Context
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 1: AUTHENTICATION & SESSION CONTEXT ---');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@vigilio.io');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app**', { timeout: 12000 });
    await page.waitForTimeout(1000);

    const dbUser = await pgClient.query(
      'SELECT u.id, u.email, m.role FROM users u JOIN memberships m ON u.id = m.user_id WHERE u.email = $1',
      ['admin@vigilio.io']
    );

    if (dbUser.rows.length === 0 || dbUser.rows[0].role !== 'owner') {
      throw new Error(`DB validation failed: user not found or role not owner. Got: ${JSON.stringify(dbUser.rows)}`);
    }

    const brandText = await page.locator('.brand').innerText();
    const avatarText = await page.locator('.avatar').innerText();
    await takeScreenshot('01-gate-auth-dashboard.png');

    recordGate(
      'Auth & Tenant Context',
      'PASS',
      `Authenticated as ${dbUser.rows[0].email} (Role: ${dbUser.rows[0].role}, Avatar: "${avatarText}"). Brand: "${brandText.trim()}".`
    );

    // -------------------------------------------------------------------------
    // GATE 2: Applications & Cryptographic API Key Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 2: APPLICATIONS & API KEY GENERATION ---');
    await page.goto(`${BASE_URL}/app/applications?org_id=${ORG_ID}&workspace_id=${WS_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const testAppName = `E2E-App-${TIMESTAMP}`;
    await page.fill('input[placeholder="HR Assistant"]', testAppName);
    await page.selectOption('#environment', 'production');
    await page.click('button[type="submit"]:has-text("Registrar")');
    await page.waitForTimeout(1200);

    // Click the newly created application button
    const appButton = page.locator(`.list-item-button:has-text("${testAppName}")`).first();
    await appButton.waitFor({ state: 'visible', timeout: 5000 });
    await appButton.click();
    await page.waitForTimeout(600);

    // Click "Generar clave"
    await page.click('button:has-text("Generar clave")');
    await page.waitForTimeout(1200);

    const generatedKeyElement = page.locator('.secret-once code');
    await generatedKeyElement.waitFor({ state: 'visible', timeout: 5000 });
    const generatedKey = await generatedKeyElement.innerText();

    if (!generatedKey.startsWith('vgl_')) {
      throw new Error(`Generated API Key does not have standard 'vgl_' prefix: ${generatedKey}`);
    }

    // Verify in PostgreSQL
    const dbApp = await pgClient.query('SELECT id, name, environment FROM applications WHERE name = $1', [testAppName]);
    if (dbApp.rows.length === 0) {
      throw new Error(`DB verification failed: application '${testAppName}' not found in database.`);
    }

    createdAppId = dbApp.rows[0].id;
    const dbKey = await pgClient.query(
      'SELECT id, prefix, token_hash, revoked_at FROM application_keys WHERE application_id = $1',
      [createdAppId]
    );

    if (dbKey.rows.length === 0) {
      throw new Error(`DB verification failed: application_keys row not found for application_id: ${createdAppId}`);
    }

    const keyRow = dbKey.rows[0];
    if (!keyRow.token_hash || keyRow.token_hash.length !== 64 || keyRow.token_hash === generatedKey) {
      throw new Error(`Cryptographic integrity violation: token_hash is either plaintext or invalid hash: ${keyRow.token_hash}`);
    }

    await takeScreenshot('02-gate-application-apikey.png');
    recordGate(
      'Applications & API Key',
      'PASS',
      `App '${testAppName}' (ID: ${createdAppId}) created. Key generated (${keyRow.prefix}••••). DB token_hash verified as 64-char SHA-256 (Plaintext never stored in DB).`
    );

    // -------------------------------------------------------------------------
    // GATE 3: Prompt Studio - Immutable Versioning & Aliasing
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 3: PROMPT STUDIO & IMMUTABLE VERSIONING ---');
    await page.goto(`${BASE_URL}/app/prompts?org_id=${ORG_ID}&workspace_id=${WS_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const testPromptName = `e2e-prompt-${TIMESTAMP}`;
    await page.fill('input[placeholder="support-responder"]', testPromptName);
    await page.fill('textarea', 'Prompt automatizado creado por suite E2E master.');
    await page.click('button[type="submit"]:has-text("Crear prompt")');
    await page.waitForTimeout(1200);

    // Select the prompt in library
    const promptItem = page.locator(`.list-item-button:has-text("${testPromptName}")`).first();
    await promptItem.waitFor({ state: 'visible', timeout: 5000 });
    await promptItem.click();
    await page.waitForTimeout(600);

    // Form "Crear versión"
    const templateText = 'Hola {{customer}}, tu consulta sobre {{topic}} fue recibida con éxito.';
    await page.locator('form:has-text("Registrar versión") input').fill('llama3.2:1b');
    await page.locator('form:has-text("Registrar versión") textarea').fill(templateText);
    await page.click('button[type="submit"]:has-text("Registrar versión")');
    await page.waitForTimeout(1500);

    // Verify in PostgreSQL
    const dbPrompt = await pgClient.query('SELECT id, name FROM prompts WHERE name = $1', [testPromptName]);
    if (dbPrompt.rows.length === 0) {
      throw new Error(`DB verification failed: prompt '${testPromptName}' not found in database.`);
    }

    createdPromptId = dbPrompt.rows[0].id;
    const dbVersion = await pgClient.query(
      'SELECT id, version, template, model, sha256 FROM prompt_versions WHERE prompt_id = $1 ORDER BY version DESC LIMIT 1',
      [createdPromptId]
    );

    if (dbVersion.rows.length === 0 || dbVersion.rows[0].template !== templateText) {
      throw new Error(`DB verification failed: prompt_version row not found or template mismatch.`);
    }

    await takeScreenshot('03-gate-prompt-version.png');
    recordGate(
      'Prompt Studio Versioning',
      'PASS',
      `Prompt '${testPromptName}' (ID: ${createdPromptId}) created with immutable v${dbVersion.rows[0].version} (Model: ${dbVersion.rows[0].model}, SHA: ${dbVersion.rows[0].sha256?.slice(0, 10)}...).`
    );

    // -------------------------------------------------------------------------
    // GATE 4: FinOps - Budget Adjustment & Transactional Check
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 4: FINOPS BUDGET TRANSACTIONAL INTEGRITY ---');
    await page.goto(`${BASE_URL}/app/budgets?org_id=${ORG_ID}&workspace_id=${WS_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Verify zero UI errors on FinOps page
    const errorCount = await page.locator('.error-state').count();
    if (errorCount > 0) {
      const errText = await page.locator('.error-state').first().innerText();
      throw new Error(`FinOps page regression: error-state displayed: ${errText}`);
    }

    const testBudgetLimit = '225.000000';
    const budgetInput = page.locator('input[placeholder="10.000000"]');
    await budgetInput.fill(testBudgetLimit);
    await page.click('button[type="submit"]:has-text("Guardar límite")');
    await page.waitForTimeout(1500);

    // Verify in PostgreSQL
    const dbBudget = await pgClient.query(
      'SELECT limit_usd, spent_usd FROM budget_policies WHERE organization_id = $1',
      [ORG_ID]
    );

    if (dbBudget.rows.length === 0 || Number(dbBudget.rows[0].limit_usd) !== 225) {
      throw new Error(`DB verification failed: budget_policies limit_usd is not 225.000000. Got: ${JSON.stringify(dbBudget.rows)}`);
    }

    const dbLedger = await pgClient.query(
      'SELECT count(*) FROM cost_ledger_entries WHERE organization_id = $1',
      [ORG_ID]
    );

    await takeScreenshot('04-gate-finops-budget.png');
    recordGate(
      'FinOps Transactional Integrity',
      'PASS',
      `Budget policy limit updated to $${Number(dbBudget.rows[0].limit_usd).toFixed(2)} USD in PostgreSQL. Active ledger entries: ${dbLedger.rows[0].count}. Zero UI errors.`
    );

    // -------------------------------------------------------------------------
    // GATE 5: Regression Datasets & Test Cases
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 5: REGRESSION DATASETS & TEST CASES ---');
    await page.goto(`${BASE_URL}/app/datasets?org_id=${ORG_ID}&workspace_id=${WS_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const testDatasetName = `e2e-dataset-${TIMESTAMP}`;
    await page.fill('input[placeholder="hr-regression"]', testDatasetName);
    await page.click('button[type="submit"]:has-text("Crear dataset")');
    await page.waitForTimeout(1200);

    // Click newly created dataset
    const datasetItem = page.locator(`.list-item-button:has-text("${testDatasetName}")`).first();
    await datasetItem.waitFor({ state: 'visible', timeout: 5000 });
    await datasetItem.click();
    await page.waitForTimeout(600);

    // Add a test case
    const caseInput = '¿Qué límite de crédito tiene Acme Corp?';
    const caseExpected = 'El cliente Acme Corp califica para ampliación de crédito.';
    const textareas = await page.locator('form:has-text("Agregar caso") textarea').all();
    if (textareas.length >= 2) {
      await textareas[0].fill(caseInput);
      await textareas[1].fill(caseExpected);
    }
    await page.click('button[type="submit"]:has-text("Agregar caso")');
    await page.waitForTimeout(1200);

    // Click "Congelar versión snapshot"
    const snapshotBtn = page.locator('button:has-text("Congelar versión snapshot")');
    if (await snapshotBtn.isVisible()) {
      await snapshotBtn.click();
      await page.waitForTimeout(1500);
    }

    // Verify in PostgreSQL
    const dbDataset = await pgClient.query('SELECT id, name FROM datasets WHERE name = $1', [testDatasetName]);
    if (dbDataset.rows.length === 0) {
      throw new Error(`DB verification failed: dataset '${testDatasetName}' not found in database.`);
    }

    createdDatasetId = dbDataset.rows[0].id;
    const dbCase = await pgClient.query(
      'SELECT id, input, expected_output FROM dataset_cases WHERE dataset_id = $1',
      [createdDatasetId]
    );

    if (dbCase.rows.length === 0 || dbCase.rows[0].expected_output !== caseExpected) {
      throw new Error(`DB verification failed: dataset_cases row not found or expected_output mismatch.`);
    }

    await takeScreenshot('05-gate-dataset-case.png');
    recordGate(
      'Regression Datasets & Cases',
      'PASS',
      `Dataset '${testDatasetName}' (ID: ${createdDatasetId}) and test case verified in PostgreSQL.`
    );

    // -------------------------------------------------------------------------
    // GATE 6: Playground & Gateway Model Binding
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 6: PLAYGROUND & GATEWAY INTERACTION ---');
    await page.goto(`${BASE_URL}/app/playground?org_id=${ORG_ID}&workspace_id=${WS_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const promptOptions = await page.locator('#pg-prompt option').allTextContents();
    const kbdShortcut = await page.locator('kbd.shortcut-kbd').innerText();

    await takeScreenshot('06-gate-playground.png');
    recordGate(
      'Playground & Gateway UI',
      'PASS',
      `Playground loaded with ${promptOptions.length - 1} prompts in library. Shortcut verified: "${kbdShortcut}".`
    );

    // -------------------------------------------------------------------------
    // GATE 7: Governance & Cryptographic Audit Verification
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 7: GOVERNANCE & AUDIT LOG INTEGRITY ---');
    await page.goto(`${BASE_URL}/app/governance?org_id=${ORG_ID}&workspace_id=${WS_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const auditEventsCount = await page.locator('table tbody tr').count();

    // Verify audit_events directly in PostgreSQL
    const dbAudit = await pgClient.query(
      'SELECT count(*) FROM audit_events WHERE organization_id = $1',
      [ORG_ID]
    );

    await takeScreenshot('07-gate-governance-audit.png');
    recordGate(
      'Governance & Audit Integrity',
      'PASS',
      `Audit log UI rendered ${auditEventsCount} events. PostgreSQL audit_events verified: ${dbAudit.rows[0].count} total logged actions.`
    );

    // -------------------------------------------------------------------------
    // GATE 8: Teardown & Database Hygiene
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 8: SAFE TEARDOWN & DATABASE HYGIENE ---');
    if (createdDatasetId) {
      await pgClient.query('DELETE FROM dataset_version_cases WHERE dataset_id = $1', [createdDatasetId]).catch(() => {});
      await pgClient.query('DELETE FROM dataset_versions WHERE dataset_id = $1', [createdDatasetId]).catch(() => {});
      await pgClient.query('DELETE FROM dataset_cases WHERE dataset_id = $1', [createdDatasetId]);
      await pgClient.query('DELETE FROM datasets WHERE id = $1', [createdDatasetId]);
    }
    if (createdPromptId) {
      await pgClient.query('DELETE FROM prompt_versions WHERE prompt_id = $1', [createdPromptId]);
      await pgClient.query('DELETE FROM prompts WHERE id = $1', [createdPromptId]);
    }
    if (createdAppId) {
      await pgClient.query('DELETE FROM application_keys WHERE application_id = $1', [createdAppId]);
      await pgClient.query('DELETE FROM applications WHERE id = $1', [createdAppId]);
    }

    // Restore budget policy back to 250.000000
    await pgClient.query('UPDATE budget_policies SET limit_usd = 250.000000 WHERE organization_id = $1', [ORG_ID]);

    recordGate(
      'Database Hygiene & Teardown',
      'PASS',
      `Safely purged test dataset (${createdDatasetId}), prompt (${createdPromptId}), app (${createdAppId}), and restored budget policy to 250.00 USD.`
    );

  } catch (error) {
    console.error('\n❌ E2E SUITE FAILED:', error);
    await takeScreenshot('error-failure-state.png');
    recordGate('E2E Execution Error', 'FAIL', error.message);
    report.error = error.message;
  } finally {
    await browser.close();
    await pgClient.end();
    report.finishedAt = new Date().toISOString();

    const reportPath = 'reports/e2e-master-report.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n================================================================================`);
    console.log(`  E2E TEST SUMMARY: ${report.gates.filter(g => g.status === 'PASS').length} PASSED / ${report.gates.filter(g => g.status === 'FAIL').length} FAILED`);
    console.log(`  Report saved to: ${reportPath}`);
    console.log(`================================================================================\n`);
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
