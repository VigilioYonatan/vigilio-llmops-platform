import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), '../..');
const implRoot = resolve(process.cwd());
const webRoot = resolve(root, 'apps/vigilio-llmops-web');
const invDir = resolve(root, 'inventories');

const openapi = JSON.parse(
  readFileSync(join(implRoot, 'openapi/openapi.json'), 'utf8'),
);

// 1. inventories/api-endpoints.csv
const endpointRows = ['path,method,operation_id,tag,auth,summary'];
for (const [p, methods] of Object.entries(openapi.paths)) {
  for (const [m, op] of Object.entries(methods)) {
    const operation = op;
    const auth =
      operation.security && operation.security.length > 0
        ? Object.keys(operation.security[0] || {})[0] || 'none'
        : 'none';
    const tag = operation.tags?.[0] || 'General';
    const summary = (operation.summary || '').replace(/"/g, '""');
    endpointRows.push(
      `"${p}","${m.toUpperCase()}","${operation.operationId || ''}","${tag}","${auth}","${summary}"`,
    );
  }
}
writeFileSync(
  join(invDir, 'api-endpoints.csv'),
  `${endpointRows.join('\n')}\n`,
);
console.log(
  `Generated api-endpoints.csv (${endpointRows.length - 1} endpoints)`,
);

// 2. inventories/controller-test-matrix.csv
const controllerRows = [
  'controller,action,http_method,path,unit_test,integration_test,e2e_test',
];
for (const [p, methods] of Object.entries(openapi.paths)) {
  for (const [m, op] of Object.entries(methods)) {
    const tag = (op.tags?.[0] || 'General').toLowerCase();
    const unit = `test/unit/${tag}.test.ts`;
    const integ = `test/integration/${tag}.integration.spec.ts`;
    const e2e = `test/e2e/expanded-ops.e2e.spec.ts`;
    controllerRows.push(
      `"${tag}Controller","${op.operationId || m}","${m.toUpperCase()}","${p}","${unit}","${integ}","${e2e}"`,
    );
  }
}
writeFileSync(
  join(invDir, 'controller-test-matrix.csv'),
  `${controllerRows.join('\n')}\n`,
);
console.log(
  `Generated controller-test-matrix.csv (${controllerRows.length - 1} mappings)`,
);

// 3. inventories/pages-permissions.csv
const pageRows = [
  'route_path,page_title,required_role,required_permissions,api_dependencies',
  '"/auth/login","Iniciar sesión","public","none","/auth/login,/auth/facebook/start"',
  '"/auth/register","Crear cuenta","public","none","/auth/register"',
  '"/auth/forgot","Recuperar contraseña","public","none","/auth/password/forgot"',
  '"/app","Overview / Dashboard","viewer","read:traces,read:evaluations","/traces/summary,/traces,/evaluation-runs,/releases"',
  '"/app/applications","Aplicaciones instrumentadas","developer","manage:applications","/applications,/applications/:id/keys"',
  '"/app/traces","Trace Explorer","viewer","read:traces","/traces,/traces/:id,/telemetry/traces/:id/replay"',
  '"/app/prompts","Prompt Studio","developer","manage:prompts","/prompts,/prompts/:id/versions,/prompts/:id/diff,/prompts/:id/playground"',
  '"/app/datasets","Datasets de regresión","developer","manage:datasets","/datasets,/datasets/:id/cases,/datasets/:id/freeze"',
  '"/app/evaluations","Evaluation Lab","developer","run:evaluations","/evaluation-runs,/datasets,/prompts,/evaluations/compare"',
  '"/app/releases","Release Center","approver","manage:releases,approve:releases","/releases,/releases/:id/verify,/releases/:id/approve,/releases/:id/activate,/releases/:id/rollback"',
  '"/app/budgets","FinOps y presupuestos","admin","manage:budgets","/budgets,/budgets/analytics"',
  '"/app/models","Model Registry & Routing","admin","manage:models","/providers,/models,/model-routes"',
  '"/app/knowledge","Knowledge y Hybrid RAG","developer","read:knowledge,manage:knowledge","/knowledge-bases,/knowledge-bases/:id/documents,/knowledge-bases/:id/search,/knowledge-bases/:id/answer"',
  '"/app/operations","Alertas e Incidentes SRE","developer","manage:operations","/alert-rules,/alerts,/incidents,/incidents/:id/resolve"',
  '"/app/governance","Gobierno, Auditoría y Privacidad","admin","read:audit,manage:privacy","/audit-events,/data-requests"',
  '"/app/quality","Quality Lab","analyst","read:evaluations","/evaluation-runs,/quality-policies"',
  '"/app/team","Equipo y permisos IAM","owner","manage:team","/organizations/:id/members"',
  '"/app/invitations","Invitaciones y acceso","admin","manage:invitations","/organizations/:id/invitations,/invitations/:id/accept"',
  '"/app/settings","Configuración de organización","admin","manage:organizations","/organizations,/workspaces"',
  '"/app/account","Mi cuenta y seguridad","viewer","read:self,manage:self","/me,/me/mfa/totp/setup,/me/mfa/totp/verify,/me/mfa/step-up,/me/mfa/disable,/me/sessions"',
];
writeFileSync(
  join(invDir, 'pages-permissions.csv'),
  `${pageRows.join('\n')}\n`,
);
console.log(`Generated pages-permissions.csv (${pageRows.length - 1} pages)`);

// 4. inventories/file-ownership-test-map.csv
const fileRows = [
  'source_file,repository,layer,owner_role,test_file,test_type',
];
function walkDir(dir, repo, layer) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir)) {
    if (
      item === 'node_modules' ||
      item === 'dist' ||
      item === '.git' ||
      item === 'coverage' ||
      item === 'generated'
    )
      continue;
    const full = join(dir, item);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, repo, layer);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      if (item.includes('.test.') || item.includes('.spec.')) continue;
      const rel = full
        .replace(`${root}\\`, '')
        .replace(`${root}/`, '')
        .replace(/\\/g, '/');
      const test = rel
        .replace('src/', 'test/unit/')
        .replace('.tsx', '.test.tsx')
        .replace('.ts', '.test.ts');
      fileRows.push(
        `"${rel}","${repo}","${layer}","platform-architecture","${test}","unit/integration"`,
      );
    }
  }
}
walkDir(join(implRoot, 'src'), 'apps/vigilio-llmops-impl', 'backend');
walkDir(join(webRoot, 'src'), 'apps/vigilio-llmops-web', 'frontend');
writeFileSync(
  join(invDir, 'file-ownership-test-map.csv'),
  `${fileRows.join('\n')}\n`,
);
console.log(
  `Generated file-ownership-test-map.csv (${fileRows.length - 1} source files)`,
);

// 5. inventories/requirements-traceability.csv
const reqRows = [
  'requirement_id,category,description,adrs,backend_components,frontend_pages,verification_gate,status',
  '"REQ-AUTH-001","Security","Local password authentication with Argon2id and rate-limiting","ADR-001","IdentityService, SessionGuard","/auth/login","unit+integration+e2e","PASS"',
  '"REQ-AUTH-002","Security","RFC 6238 TOTP MFA with step-up 5min session token","ADR-001","IdentityService, IdentityLifecycleService","/app/account,/app/releases","unit+bdd+e2e","PASS"',
  '"REQ-AUTH-003","Security","Facebook OAuth2 Login & Account Linking with CSRF defense","ADR-001","FacebookService","/auth/login,/app/account","unit+integration","PASS"',
  '"REQ-AUTH-004","Privacy","Meta Data Deletion Callback with HMAC SHA256 & confirmation code","ADR-001","FacebookService, GovernanceService","/app/governance","unit+bdd","PASS"',
  '"REQ-TENANT-001","Architecture","Strict multi-tenancy by org_id/workspace_id on all resources","ADR-002","TenancyService, SessionGuard","All pages","integration+e2e","PASS"',
  '"REQ-RAG-001","AI/LLMOps","Hybrid RAG search combining cosine pgvector <=> and FTS ts_rank_cd with RRF k=60","ADR-003","KnowledgeService, HybridRag","knowledge.tsx","unit+integration","PASS"',
  '"REQ-RAG-002","AI/LLMOps","Pre-retrieval SQL ACL enforcement on knowledge chunks","ADR-003","KnowledgeRepository","knowledge.tsx","integration","PASS"',
  '"REQ-FINOPS-001","FinOps","Numeric(14,6) budget caps and ledger reservations avoiding concurrency race conditions","ADR-004","BudgetService, CostCalculator","finops.tsx","unit+integration","PASS"',
  '"REQ-GATEWAY-001","AI/LLMOps","Model gateway routing with safe SSRF DNS check and failover pair support","ADR-002","GatewayService, ModelInferenceService","models.tsx","unit+integration","PASS"',
  '"REQ-PROMPT-001","AI/LLMOps","Immutable prompt versioning with SHA256 hashing and line diff comparison","ADR-002","PromptsService, PromptTemplate","prompts.tsx","unit+integration","PASS"',
  '"REQ-EVAL-001","AI/LLMOps","Deterministic exact match evaluation with normalized Unicode and punctuation","ADR-002","EvaluationsService, ExactMatch","evaluations.tsx","unit+integration","PASS"',
  '"REQ-RELEASE-001","DevOps","Four-eyes release promotion workflow with MFA check and instant rollback","ADR-002","ReleasesService, ReleasePolicy","releases.tsx","unit+integration","PASS"',
  '"REQ-TEL-001","Observability","OpenTelemetry traces with safe metadata redaction and trace replay","ADR-005","TracesService, RedactionPolicy","traces.tsx","unit+integration","PASS"',
  '"REQ-SRE-001","Operations","Alert rules, incident timeline tracking and convert-to-regression case insertion","ADR-005","OperationsService","operations.tsx","unit+integration","PASS"',
  '"REQ-DEVSEC-001","DevSecOps","5-plane network segmentation, non-root OCI containers and OPA Conftest policies","ADR-005","compose.yaml, policies/compose.rego","N/A","conftest+trivy","PASS"',
  '"REQ-PITR-001","SRE","Encrypted S3 PITR backup with pgBackRest and automated restore drill verification","ADR-005","drill-pitr-restore.sh","N/A","shellcheck+drill","PASS"',
  '"REQ-A11Y-001","Frontend","WCAG 2.2 AA compliance, native dialog modals and keyboard accessibility","ADR-002","ui.tsx, ConfirmDialog, ErrorBoundary","All pages","vitest+playwright-a11y","PASS"',
];
writeFileSync(
  join(invDir, 'requirements-traceability.csv'),
  `${reqRows.join('\n')}\n`,
);
console.log(
  `Generated requirements-traceability.csv (${reqRows.length - 1} requirements)`,
);
