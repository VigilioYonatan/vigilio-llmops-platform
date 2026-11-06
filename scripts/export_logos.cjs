const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../apps/vigilio-llmops-web/node_modules/playwright'));

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

  const darkSvg = fs.readFileSync(path.join(__dirname, '../docs/assets/logo-dark.svg'), 'utf8');
  await page.setContent(`<html style="margin:0;padding:0;background:transparent;"><body style="margin:0;padding:0;overflow:hidden;background:transparent;">${darkSvg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, '../docs/assets/logo-dark.png'), omitBackground: true });

  const lightSvg = fs.readFileSync(path.join(__dirname, '../docs/assets/logo-light.svg'), 'utf8');
  await page.setContent(`<html style="margin:0;padding:0;background:transparent;"><body style="margin:0;padding:0;overflow:hidden;background:transparent;">${lightSvg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, '../docs/assets/logo-light.png'), omitBackground: true });

  await browser.close();
  console.log('✓ Both logo-dark.png and logo-light.png generated successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
