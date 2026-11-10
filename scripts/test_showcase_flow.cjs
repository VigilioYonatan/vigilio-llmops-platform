const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../apps/vigilio-llmops-web/node_modules/playwright'));

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  console.log('1. Navigating to login...');
  await page.goto('http://localhost:5174/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@vigilio.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  console.log('2. Waiting for dashboard navigation...');
  await page.waitForURL('**/app**', { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log('3. Current URL:', page.url());
  const title = await page.title();
  console.log('4. Page Title:', title);

  const heading = await page.locator('h1').first().innerText();
  console.log('5. Main Heading:', heading);

  await browser.close();
  console.log('✓ Smoke test passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
