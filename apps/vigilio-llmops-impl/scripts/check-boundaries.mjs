import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'src/modules');
let failures = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      walk(file);
      continue;
    }
    if (!file.endsWith('.ts')) continue;
    const body = readFileSync(file, 'utf8');
    const rel = relative(root, file).replace(/\\/g, '/');

    if (
      rel.includes('/presentation/') &&
      /database\.service|drizzle-orm|\bpg\b/.test(body)
    ) {
      console.error('SQL/DB forbidden import in presentation:', rel);
      failures++;
    }

    if (
      rel.includes('/domain/') &&
      /@nestjs|database|infrastructure/.test(body)
    ) {
      console.error('Domain depends on infrastructure/framework:', rel);
      failures++;
    }

    // In application layer (excluding ports), forbid direct Drizzle/PG imports
    if (
      rel.includes('/application/') &&
      !rel.includes('/ports/') &&
      /drizzle-orm|\bpg\b|database\.service/.test(body)
    ) {
      console.error(
        'Application depends on concrete persistence instead of ports:',
        rel,
      );
      failures++;
    }
  }
}

walk(root);

if (failures > 0) {
  console.error(`Boundary check failed with ${failures} violations.`);
  process.exit(1);
}

console.log(
  'Hexagonal boundary check passed: zero forbidden cross-layer imports detected.',
);
