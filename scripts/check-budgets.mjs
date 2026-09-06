import { chromium } from '../apps/vigilio-llmops-web/node_modules/playwright/index.mjs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5174/auth/login');
  await page.fill('input[type=email]', 'admin@vigilio.io');
  await page.fill('input[type=password]', 'Password123!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/app**', { timeout: 10000 });

  await page.goto('http://localhost:5174/app/budgets');
  await page.waitForTimeout(2000);

  const errors = await page.locator('.error-state').allTextContents();
  console.log('Errors found on /app/budgets:', errors);

  const html = await page.locator('.panel').first().innerHTML();
  console.log('Panel HTML preview:', html.slice(0, 300));

  await page.screenshot({ path: 'reports/screenshots/debug-budgets.png' });
  console.log('Saved screenshot to reports/screenshots/debug-budgets.png');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
