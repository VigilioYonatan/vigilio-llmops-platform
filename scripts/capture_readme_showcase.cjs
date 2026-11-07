const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { chromium } = require(
  path.resolve(__dirname, '../apps/vigilio-llmops-web/node_modules/playwright'),
);

const FRONTEND_BASE_URL = 'http://localhost:5174';
const SCALAR_REFERENCE_URL = 'http://localhost:3001/reference';

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(REPOSITORY_ROOT, 'docs/assets/screenshots');
const DEMOS_DIR = path.join(REPOSITORY_ROOT, 'docs/assets/demos');
const VIDEOS_DIR = path.join(REPOSITORY_ROOT, 'docs/assets/videos');
const FRAMES_ROOT = path.join(REPOSITORY_ROOT, 'test-results/showcase-frames');

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

[SCREENSHOTS_DIR, DEMOS_DIR, VIDEOS_DIR, FRAMES_ROOT].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

async function login(page, themeMode = 'dark') {
  await page.goto(`${FRONTEND_BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@vigilio.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app**', { timeout: 15000 });
  await page.waitForTimeout(1000);

  if (themeMode === 'light') {
    await page.evaluate(() => {
      const app = document.querySelector('.application');
      if (app) {
        app.classList.remove('theme-dark');
        app.classList.add('theme-light');
        app.setAttribute('data-theme', 'light');
      }
    });
  }
}

async function installOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById('showcase-demo-cursor')) return;

    const cursor = document.createElement('div');
    cursor.id = 'showcase-demo-cursor';
    cursor.style.cssText = [
      'position:fixed',
      'left:640px',
      'top:400px',
      'width:22px',
      'height:22px',
      'border-radius:9999px',
      'background:rgba(59,130,246,0.92)',
      'border:2.5px solid #ffffff',
      'box-shadow:0 0 0 6px rgba(59,130,246,0.28), 0 8px 20px rgba(0,0,0,0.45)',
      'pointer-events:none',
      'z-index:2147483647',
      'transform:translate(-50%,-50%)',
      'transition:left 240ms cubic-bezier(0.22,1,0.36,1), top 240ms cubic-bezier(0.22,1,0.36,1), transform 140ms ease',
    ].join(';');
    document.body.appendChild(cursor);

    const banner = document.createElement('div');
    banner.id = 'showcase-demo-caption';
    banner.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:28px',
      'padding:10px 18px',
      'border-radius:9999px',
      'background:rgba(15,23,42,0.94)',
      'color:#f8fafc',
      'border:1px solid rgba(59,130,246,0.6)',
      'box-shadow:0 12px 30px rgba(0,0,0,0.55)',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:13px',
      'font-weight:600',
      'letter-spacing:0.02em',
      'pointer-events:none',
      'z-index:2147483646',
    ].join(';');
    banner.textContent = 'Vigilio LLMOps Platform';
    document.body.appendChild(banner);
  });
}

async function moveCursorTo(page, x, y, captionText) {
  await installOverlay(page);
  await page.evaluate(({ cx, cy, cap }) => {
    const cursor = document.getElementById('showcase-demo-cursor');
    if (cursor) {
      cursor.style.left = `${cx}px`;
      cursor.style.top = `${cy}px`;
      cursor.style.transform = 'translate(-50%,-50%) scale(1)';
    }
    const banner = document.getElementById('showcase-demo-caption');
    if (banner && cap) {
      banner.textContent = cap;
    }
  }, { cx: x, cy: y, cap: captionText });
}

async function pointAndClickLocator(page, locator, captionText, snapFrame) {
  await installOverlay(page);
  const box = await locator.boundingBox();
  if (box) {
    const targetX = Math.round(box.x + Math.min(box.width * 0.45, 90));
    const targetY = Math.round(box.y + box.height * 0.5);
    await moveCursorTo(page, targetX, targetY, captionText);
    await page.waitForTimeout(280);
    if (snapFrame) await snapFrame(450);

    // Pulse
    await page.evaluate(() => {
      const cursor = document.getElementById('showcase-demo-cursor');
      if (cursor) {
        cursor.style.transform = 'translate(-50%,-50%) scale(0.75)';
        cursor.style.background = 'rgba(16,185,129,0.95)';
      }
    });
    await page.waitForTimeout(140);
    if (snapFrame) await snapFrame(250);

    await page.evaluate(() => {
      const cursor = document.getElementById('showcase-demo-cursor');
      if (cursor) {
        cursor.style.transform = 'translate(-50%,-50%) scale(1)';
        cursor.style.background = 'rgba(59,130,246,0.92)';
      }
    });
  }
}

async function captureStaticScreenshots(browser) {
  console.log('\n[Fase 1/3] Capturando Pantallas Estáticas 2x Retina (Dark & Light Mode)...');

  // 1A. Dark Mode
  const darkContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await darkContext.newPage();
  await login(page, 'dark');

  // 01-hero-dashboard-dark.png
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-hero-dashboard-dark.png') });
  console.log('  ✓ 01-hero-dashboard-dark.png');

  // 02-prompt-studio-versioning.png
  await page.click('button:has-text("Prompt Studio")');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-prompt-studio-versioning.png') });
  console.log('  ✓ 02-prompt-studio-versioning.png');

  // 03-playground-interactive-chat.png
  await page.click('button:has-text("Playground & Gateway")');
  await page.waitForTimeout(900);
  // Select first prompt and version in playground
  const pgPrompt = page.locator('#pg-prompt');
  if (await pgPrompt.isVisible()) {
    const promptOptions = await pgPrompt.locator('option').all();
    if (promptOptions.length > 1) {
      await pgPrompt.selectOption({ index: 1 });
      await page.waitForTimeout(600);
      const pgVersion = page.locator('#pg-version');
      const versionOptions = await pgVersion.locator('option').all();
      if (versionOptions.length > 1) {
        await pgVersion.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-playground-interactive-chat.png') });
  console.log('  ✓ 03-playground-interactive-chat.png');

  // 04-evaluations-and-quality-gates.png
  await page.click('button:has-text("Evaluaciones")');
  await page.waitForTimeout(900);
  const viewResultsBtn = page.locator('button:has-text("Ver resultados")').first();
  if (await viewResultsBtn.isVisible()) {
    await viewResultsBtn.click();
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-evaluations-and-quality-gates.png') });
  console.log('  ✓ 04-evaluations-and-quality-gates.png');

  // 05-releases-and-canary-deploy.png
  await page.click('button:has-text("Releases")');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-releases-and-canary-deploy.png') });
  console.log('  ✓ 05-releases-and-canary-deploy.png');

  // 06-hybrid-rag-knowledge-explorer.png
  await page.click('button:has-text("Conocimiento & RAG")');
  await page.waitForTimeout(900);
  const kbSelect = page.locator('#kb-select');
  if (await kbSelect.isVisible()) {
    const kbOpts = await kbSelect.locator('option').all();
    if (kbOpts.length > 1) {
      await kbSelect.selectOption({ index: 1 });
      await page.waitForTimeout(700);
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-hybrid-rag-knowledge-explorer.png') });
  console.log('  ✓ 06-hybrid-rag-knowledge-explorer.png');

  // 07-finops-budget-ledger.png
  await page.click('button:has-text("FinOps y Costos")');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-finops-budget-ledger.png') });
  console.log('  ✓ 07-finops-budget-ledger.png');

  // 08-opentelemetry-traces-waterfall.png
  await page.click('button:has-text("Traces")');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08-opentelemetry-traces-waterfall.png') });
  console.log('  ✓ 08-opentelemetry-traces-waterfall.png');

  // 09-iam-rbac-and-audit-log.png
  await page.click('button:has-text("Gobierno y auditoría")');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09-iam-rbac-and-audit-log.png') });
  console.log('  ✓ 09-iam-rbac-and-audit-log.png');

  // 10-scalar-openapi-reference.png
  await page.goto(SCALAR_REFERENCE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10-scalar-openapi-reference.png') });
  console.log('  ✓ 10-scalar-openapi-reference.png');

  await darkContext.close();

  // 1B. Light Mode Dashboard Screenshot
  const lightContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const lightPage = await lightContext.newPage();
  await login(lightPage, 'light');
  await lightPage.waitForTimeout(900);
  await lightPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-hero-dashboard-light.png') });
  console.log('  ✓ 01-hero-dashboard-light.png (Light Mode)');
  await lightContext.close();
}

async function recordInteractiveDemoClip(browser, clipConfig) {
  const clipFramesDir = path.join(FRAMES_ROOT, clipConfig.name);
  resetDir(clipFramesDir);

  const rawVideoTempDir = path.join(FRAMES_ROOT, `${clipConfig.name}-video`);
  resetDir(rawVideoTempDir);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    recordVideo: {
      dir: rawVideoTempDir,
      size: { width: 1280, height: 800 },
    },
  });

  const page = await context.newPage();
  const frameDurationsMs = [];
  let frameCounter = 0;

  async function snapFrame(durationMs) {
    frameCounter += 1;
    const padded = String(frameCounter).padStart(3, '0');
    await page.screenshot({
      path: path.join(clipFramesDir, `frame_${padded}.png`),
    });
    frameDurationsMs.push(durationMs);
  }

  await login(page, 'dark');
  await installOverlay(page);
  await clipConfig.runScenario(page, snapFrame);

  const recordedVideo = page.video();
  await context.close();

  if (recordedVideo) {
    const srcVideo = await recordedVideo.path();
    const dstVideo = path.join(VIDEOS_DIR, `${clipConfig.name}.webm`);
    fs.copyFileSync(srcVideo, dstVideo);
    console.log(`  ✓ Video WebM: docs/assets/videos/${clipConfig.name}.webm`);
  }

  return {
    name: clipConfig.name,
    frames_directory: clipFramesDir,
    output_gif_path: path.join(DEMOS_DIR, `${clipConfig.name}.gif`),
    frame_durations_ms: frameDurationsMs,
  };
}

async function main() {
  console.log('================================================================');
  console.log('  VIGILIO LLMOPS — SHOWCASE CAPTURE & VIDEO PIPELINE (SENIOR MODE)');
  console.log('================================================================');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  // 1. Static Screenshots 2x
  await captureStaticScreenshots(browser);

  // 2. Interactive Clips
  console.log('\n[Fase 2/3] Grabando Videos Interactivos y Capturando Fotogramas...');
  const recordingsManifest = [];

  // CLIP 1: Playground & Prompt Studio
  const clip1Result = await recordInteractiveDemoClip(browser, {
    name: '01-playground-and-prompts',
    runScenario: async (page, snapFrame) => {
      // Step 1: Nav to Prompts
      const promptsLink = page.locator('button:has-text("Prompt Studio")');
      await pointAndClickLocator(page, promptsLink, 'Paso 1/5: Navegar a Prompt Studio', snapFrame);
      await promptsLink.click();
      await page.waitForTimeout(600);
      await snapFrame(700);

      // Step 2: Nav to Playground
      const pgLink = page.locator('button:has-text("Playground & Gateway")');
      await pointAndClickLocator(page, pgLink, 'Paso 2/5: Abrir Playground Interactivo', snapFrame);
      await pgLink.click();
      await page.waitForTimeout(600);
      await snapFrame(700);

      // Step 3: Select prompt
      const promptSel = page.locator('#pg-prompt');
      await pointAndClickLocator(page, promptSel, 'Paso 3/5: Seleccionar plantilla versionada', snapFrame);
      await promptSel.selectOption({ index: 1 });
      await page.waitForTimeout(400);
      await snapFrame(700);

      // Step 4: Select version
      const verSel = page.locator('#pg-version');
      await pointAndClickLocator(page, verSel, 'Paso 4/5: Fijar versión inmutable v2 (GPT-4o)', snapFrame);
      await verSel.selectOption({ index: 1 });
      await page.waitForTimeout(400);
      await snapFrame(700);

      // Step 5: Execute in playground
      const execBtn = page.locator('button:has-text("Ejecutar en Playground")');
      await pointAndClickLocator(page, execBtn, 'Paso 5/5: Ejecutar inferencia y auditar tokens', snapFrame);
      await execBtn.click();
      await page.waitForTimeout(1000);
      await moveCursorTo(page, 780, 420, 'Inferencia completada · Métricas de latencia y tokens');
      await snapFrame(1400);
    },
  });
  recordingsManifest.push(clip1Result);

  // CLIP 2: Evaluations & Quality Gates Release
  const clip2Result = await recordInteractiveDemoClip(browser, {
    name: '02-evaluations-and-releases',
    runScenario: async (page, snapFrame) => {
      // Step 1: Nav to Evaluations
      const evalsLink = page.locator('button:has-text("Evaluaciones")');
      await pointAndClickLocator(page, evalsLink, 'Paso 1/4: Abrir Evaluation Lab & Benchmarks', snapFrame);
      await evalsLink.click();
      await page.waitForTimeout(600);
      await snapFrame(700);

      // Step 2: View results
      const resultsBtn = page.locator('button:has-text("Ver resultados")').first();
      if (await resultsBtn.isVisible()) {
        await pointAndClickLocator(page, resultsBtn, 'Paso 2/4: Auditar asserts de evaluación (96% Pass)', snapFrame);
        await resultsBtn.click();
        await page.waitForTimeout(600);
        await snapFrame(900);
      }

      // Step 3: Nav to Releases
      const releasesLink = page.locator('button:has-text("Releases")');
      await pointAndClickLocator(page, releasesLink, 'Paso 3/4: Navegar a Gobernanza de Releases', snapFrame);
      await releasesLink.click();
      await page.waitForTimeout(600);
      await snapFrame(800);

      // Step 4: Highlight Quality Gate Policy
      await moveCursorTo(page, 520, 360, 'Paso 4/4: Quality Gate Validado · Listo para Despliegue');
      await snapFrame(1400);
    },
  });
  recordingsManifest.push(clip2Result);

  // CLIP 3: Hybrid RAG Search & Dark/Light Mode Theme Toggle
  const clip3Result = await recordInteractiveDemoClip(browser, {
    name: '03-hybrid-rag-and-theme-toggle',
    runScenario: async (page, snapFrame) => {
      // Step 1: Nav to Knowledge
      const kbLink = page.locator('button:has-text("Conocimiento & RAG")');
      await pointAndClickLocator(page, kbLink, 'Paso 1/5: Abrir Hybrid RAG (pgvector + FTS RRF)', snapFrame);
      await kbLink.click();
      await page.waitForTimeout(600);
      await snapFrame(700);

      // Step 2: Select Knowledge Base
      const kbSel = page.locator('#kb-select');
      if (await kbSel.isVisible()) {
        await pointAndClickLocator(page, kbSel, 'Paso 2/5: Seleccionar Base Documental SRE', snapFrame);
        await kbSel.selectOption({ index: 1 });
        await page.waitForTimeout(500);
        await snapFrame(700);
      }

      // Step 3: Fill search query & execute
      const searchInput = page.locator('input[label="Consulta de búsqueda"], input[type="text"]').last();
      if (await searchInput.isVisible()) {
        await pointAndClickLocator(page, searchInput, 'Paso 3/5: Búsqueda Híbrida semántica y léxica', snapFrame);
        await searchInput.fill('Failover réplica PostgreSQL standby');
        await page.waitForTimeout(300);
        const searchBtn = page.locator('button:has-text("Búsqueda Híbrida")');
        if (await searchBtn.isVisible()) {
          await searchBtn.click();
          await page.waitForTimeout(700);
          await snapFrame(900);
        }
      }

      // Step 4: Theme Toggle to Light Mode!
      const themeToggleBtn = page.locator('button:has-text("Cambiar tema")');
      await pointAndClickLocator(page, themeToggleBtn, 'Paso 4/5: Conmutar a Modo Claro (Light Mode)', snapFrame);
      await themeToggleBtn.click();
      await page.waitForTimeout(700);
      await moveCursorTo(page, 640, 360, 'Tema Claro Activo · Diseño Accesible WCAG');
      await snapFrame(1200);

      // Step 5: Theme Toggle back to Dark Mode!
      await pointAndClickLocator(page, themeToggleBtn, 'Paso 5/5: Conmutar de vuelta a Modo Oscuro', snapFrame);
      await themeToggleBtn.click();
      await page.waitForTimeout(700);
      await moveCursorTo(page, 640, 360, 'Tema Oscuro Activo · Experiencia Developer-First');
      await snapFrame(1400);
    },
  });
  recordingsManifest.push(clip3Result);

  await browser.close();

  // 3. Save Manifest for GIF Encoder
  const manifestPath = path.join(REPOSITORY_ROOT, 'test-results/showcase-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ recordings: recordingsManifest }, null, 2), 'utf8');
  console.log(`\n✓ Manifest guardado: ${manifestPath}`);

  // 4. Run Python GIF Encoder
  console.log('\n[Fase 3/3] Codificando GIFs animados con Python Pillow (LANCZOS + MEDIANCUT)...');
  execFileSync('python', [path.join(REPOSITORY_ROOT, 'scripts/encode_showcase_gifs.py'), manifestPath], {
    cwd: REPOSITORY_ROOT,
    stdio: 'inherit',
  });

  console.log('\n================================================================');
  console.log('🏆 ¡SHOWCASE VISUAL Y CAPTURAS COMPLETADAS CON ÉXITO SENIOR MODE!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal Showcase Capture Error:', err);
  process.exit(1);
});
