import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const stageDir = join(root, '.tmp-contracts');
const stageSrc = join(stageDir, 'src');
const genDir = join(root, 'generated');

if (existsSync(stageDir)) {
  rmSync(stageDir, { recursive: true, force: true });
}
mkdirSync(stageSrc, { recursive: true });
mkdirSync(genDir, { recursive: true });

// 1. Write package.json for @vigilio/llmops-contracts
const pkg = {
  name: '@vigilio/llmops-contracts',
  version: '1.0.0',
  description:
    'Authoritative API and event contracts for Vigilio LLMOps Platform',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  files: ['dist'],
  sideEffects: false,
  peerDependencies: {
    zod: '>=4.0.0-0',
  },
};
writeFileSync(
  join(stageDir, 'package.json'),
  `${JSON.stringify(pkg, null, 2)}\n`,
);

// 2. Aggregate all schemas and types into index.ts
const indexContent = `import { z } from 'zod';

// Identity
export * from './identity.dto';
// Organizations
export * from './organization.dto';
// Applications
export * from './application.dto';
// Model Catalog
export * from './model-catalog.dto';
// Prompts
export * from './prompt.dto';
// Datasets
export * from './dataset.dto';
// Evaluations
export * from './evaluation.dto';
// Releases
export * from './release.dto';
// FinOps
export * from './finops.dto';
// Gateway
export * from './gateway.dto';
// Knowledge
export * from './knowledge.dto';
// Telemetry
export * from './trace.dto';
// Operations
export * from './operations.dto';
// Governance
export * from './governance.dto';
`;

writeFileSync(join(stageSrc, 'index.ts'), indexContent);

// Copy DTO files from src/modules/
const dtoFiles = [
  {
    from: 'src/modules/identity/presentation/http/dto/auth.dto.ts',
    to: 'identity.dto.ts',
  },
  {
    from: 'src/modules/organizations/presentation/http/dto/organization.dto.ts',
    to: 'organization.dto.ts',
  },
  {
    from: 'src/modules/applications/presentation/http/dto/application.dto.ts',
    to: 'application.dto.ts',
  },
  {
    from: 'src/modules/model-catalog/presentation/http/dto/model-catalog.dto.ts',
    to: 'model-catalog.dto.ts',
  },
  {
    from: 'src/modules/prompts/presentation/http/dto/prompt.dto.ts',
    to: 'prompt.dto.ts',
  },
  {
    from: 'src/modules/datasets/presentation/http/dto/dataset.dto.ts',
    to: 'dataset.dto.ts',
  },
  {
    from: 'src/modules/evaluations/presentation/http/dto/evaluation.dto.ts',
    to: 'evaluation.dto.ts',
  },
  {
    from: 'src/modules/releases/presentation/http/dto/release.dto.ts',
    to: 'release.dto.ts',
  },
  {
    from: 'src/modules/finops/presentation/http/dto/budget.dto.ts',
    to: 'finops.dto.ts',
  },
  {
    from: 'src/modules/gateway/presentation/http/dto/gateway.dto.ts',
    to: 'gateway.dto.ts',
  },
  {
    from: 'src/modules/knowledge/presentation/http/dto/knowledge.dto.ts',
    to: 'knowledge.dto.ts',
  },
  {
    from: 'src/modules/telemetry/presentation/http/dto/trace.dto.ts',
    to: 'trace.dto.ts',
  },
  {
    from: 'src/modules/operations/presentation/http/dto/operations.dto.ts',
    to: 'operations.dto.ts',
  },
  {
    from: 'src/modules/governance/presentation/http/dto/governance.dto.ts',
    to: 'governance.dto.ts',
  },
];

for (const f of dtoFiles) {
  cpSync(join(root, f.from), join(stageSrc, f.to));
}

// Write tsconfig for bundling contracts
const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    declaration: true,
    strict: true,
    skipLibCheck: true,
    outDir: './dist',
    rootDir: './src',
  },
  include: ['src/**/*.ts'],
};
writeFileSync(
  join(stageDir, 'tsconfig.json'),
  `${JSON.stringify(tsconfig, null, 2)}\n`,
);

// 3. Compile TypeScript
console.log('Compiling @vigilio/llmops-contracts...');
execSync('npx tsc -p tsconfig.json', { cwd: stageDir, stdio: 'inherit' });

// 4. Pack into tgz
console.log('Packaging tarball...');
execSync(`npm pack --pack-destination "${genDir}"`, {
  cwd: stageDir,
  stdio: 'inherit',
});

// Clean up staging directory
rmSync(stageDir, { recursive: true, force: true });

console.log(
  'Successfully created generated/vigilio-llmops-contracts-1.0.0.tgz',
);
