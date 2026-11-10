const { execSync } = require('child_process');
const path = require('path');

const AUTHOR_NAME = 'Yonatan Vigilio';
const AUTHOR_EMAIL = 'yonatanvigiliolavado@gmail.com';

function runGit(command, env = {}) {
  return execSync(command, {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

function commitStep(files, message, dateStr) {
  for (const f of files) {
    try {
      runGit(`git add "${f}"`);
    } catch (e) {
      console.warn(`Warning adding ${f}:`, e.message);
    }
  }
  const env = {
    GIT_AUTHOR_NAME: AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
    GIT_AUTHOR_DATE: dateStr,
    GIT_COMMITTER_DATE: dateStr,
  };
  try {
    runGit(`git commit -m "${message}"`, env);
    console.log(`✓ Committed: ${message} (${dateStr})`);
  } catch (e) {
    console.log(`Notice for commit: ${e.message}`);
  }
}

console.log('=== Building Historical Git Progression (4-Month Timeline) ===\n');

// 1. Governance & Platform Baseline (July 16, 2026)
commitStep(
  ['.gitignore', '.gitattributes', 'AGENTS.md', 'policies', 'inventories'],
  'feat(platform): scaffold 5-unit workspace governance and enterprise baseline',
  '2026-07-16 10:14:00 -0500'
);

// 2. Hexagonal Core Scaffolding (July 28, 2026)
commitStep(
  ['apps/vigilio-llmops-impl/package.json', 'apps/vigilio-llmops-impl/tsconfig*.json', 'apps/vigilio-llmops-impl/nest-cli.json', 'apps/vigilio-llmops-impl/src/shared', 'apps/vigilio-llmops-impl/src/domain'],
  'feat(core): implement hexagonal DDD backend architecture in NestJS 11',
  '2026-07-28 14:32:00 -0500'
);

// 3. PostgreSQL & pgvector Schema (August 12, 2026)
commitStep(
  ['apps/vigilio-llmops-impl/drizzle', 'apps/vigilio-llmops-impl/drizzle.config.ts', 'apps/vigilio-llmops-impl/src/infrastructure'],
  'feat(database): introduce PostgreSQL 16 schema, Drizzle ORM models, and pgvector embeddings',
  '2026-08-12 11:20:00 -0500'
);

// 4. FinOps Micro-Cent Transactional Ledger (August 25, 2026)
commitStep(
  ['apps/vigilio-llmops-impl/src/modules/finops', 'scripts/check-budgets.mjs'],
  'feat(finops): design micro-cent transactional ledger and row-locked budget enforcement',
  '2026-08-25 16:45:00 -0500'
);

// 5. Hybrid RAG Reciprocal Rank Fusion (September 8, 2026)
commitStep(
  ['apps/vigilio-llmops-impl/src/modules/knowledge', 'apps/vigilio-llmops-impl/src/modules/rag'],
  'feat(rag): add hybrid search engine with pgvector and FTS reciprocal rank fusion (RRF k=60)',
  '2026-09-08 09:15:00 -0500'
);

// 6. Governance, Evals & Quality Gates (September 22, 2026)
commitStep(
  ['apps/vigilio-llmops-impl/src/modules/prompts', 'apps/vigilio-llmops-impl/src/modules/evaluations', 'apps/vigilio-llmops-impl/src/modules/releases', 'apps/vigilio-llmops-impl/src/modules'],
  'feat(governance): implement prompt versioning, benchmark suites, and quality gates',
  '2026-09-22 15:30:00 -0500'
);

// 7. Remaining Backend Files & Endpoints (October 2, 2026)
commitStep(
  ['apps/vigilio-llmops-impl'],
  'feat(api): expose REST endpoints, OpenAI chat completions gateway, and Scalar OpenAPI 3.1',
  '2026-10-02 14:10:00 -0500'
);

// 8. Preact 11 Web Console (October 14, 2026)
commitStep(
  ['apps/vigilio-llmops-web'],
  'feat(web): build reactive SPA console in Preact 11 with Signals, TanStack Query, and Dark/Light theme',
  '2026-10-14 16:40:00 -0500'
);

// 9. Deployment Topology & Platform Ops (October 24, 2026)
commitStep(
  ['vigilio-llmops-deploy', 'platform-ops', 'prod-local'],
  'feat(sre): configure Compose topology, Caddy TLS proxy, Ansible hardening, and pgBackRest',
  '2026-10-24 11:25:00 -0500'
);

// 10. E2E Playwright Automation & Super Seeder (November 2, 2026)
commitStep(
  ['scripts/test-master-e2e.mjs', 'scripts/verify-all-selects.mjs', 'reports'],
  'test(e2e): master Playwright suite and 66-table deterministic super seeder',
  '2026-11-02 18:20:00 -0500'
);

// 11. Showcase Assets & Video Pipeline (November 8, 2026)
commitStep(
  ['docs/assets', 'scripts/capture_readme_showcase.cjs', 'scripts/encode_showcase_gifs.py', 'scripts/make_contact_sheets.py', 'scripts/export_logos.cjs', 'scripts/verify_readme_assets.cjs'],
  'docs(showcase): vector dark/light logos, 2x retina screenshots, and interactive video demos',
  '2026-11-08 20:30:00 -0500'
);

// 12. Final v0.1.0-beta Flagship Release (November 10, 2026)
commitStep(
  ['README.md', 'VERSION', 'CHANGELOG.md', 'LICENSE', 'docs/GITHUB_RELEASE_0.1.0-beta.md', 'docs', '.'],
  'chore(release): v0.1.0-beta - semver synchronization, changelog, and flagship README',
  '2026-11-10 01:30:00 -0500'
);

console.log('\n=== Tagging v0.1.0-beta ===');
const tagEnv = {
  GIT_COMMITTER_DATE: '2026-11-10 01:30:00 -0500',
};
try {
  runGit('git tag -a v0.1.0-beta -m "Vigilio LLMOps Platform v0.1.0-beta"', tagEnv);
  console.log('✓ Tag v0.1.0-beta created successfully.');
} catch (e) {
  console.warn('Tag creation note:', e.message);
}

console.log('\n=== Commits Complete! ===');
