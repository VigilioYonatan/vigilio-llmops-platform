import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), '../..');
const invDir = resolve(root, 'inventories');

const requiredInventories = [
  'api-endpoints.csv',
  'controller-test-matrix.csv',
  'pages-permissions.csv',
  'file-ownership-test-map.csv',
  'requirements-traceability.csv',
];

console.log('Verifying mechanical CSV inventories in inventories/...');

let hasError = false;
for (const inv of requiredInventories) {
  const filePath = join(invDir, inv);
  if (!existsSync(filePath)) {
    console.error(`FAIL: Missing inventory ${inv}`);
    hasError = true;
    continue;
  }
  const content = readFileSync(filePath, 'utf8').trim();
  const lines = content.split('\n');
  if (lines.length < 2) {
    console.error(`FAIL: Inventory ${inv} is empty or has only header`);
    hasError = true;
    continue;
  }
  console.log(`PASS: ${inv} (${lines.length - 1} records)`);
}

if (hasError) {
  process.exit(1);
}

console.log('All 5 mechanical CSV inventories verified successfully.');
