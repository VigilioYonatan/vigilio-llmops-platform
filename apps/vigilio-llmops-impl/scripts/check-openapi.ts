import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function check(): void {
  const openapiPath = join(process.cwd(), 'openapi/openapi.json');
  if (!existsSync(openapiPath)) {
    console.error('Missing openapi/openapi.json. Run pnpm openapi first.');
    process.exit(1);
  }

  const content = readFileSync(openapiPath, 'utf8');
  try {
    const doc = JSON.parse(content);
    if (!doc.openapi || !doc.info || !doc.paths) {
      console.error('Invalid OpenAPI document structure.');
      process.exit(1);
    }
    const pathCount = Object.keys(doc.paths).length;
    console.log(
      `OpenAPI check passed: valid OpenAPI ${doc.openapi} specification with ${pathCount} endpoints.`,
    );
  } catch (err) {
    console.error('Failed to parse openapi/openapi.json:', err);
    process.exit(1);
  }
}

check();
