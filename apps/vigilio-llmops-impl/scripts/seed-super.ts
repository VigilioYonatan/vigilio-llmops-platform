import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import { faker } from '@faker-js/faker';
import { encryptSecret } from '../src/shared/crypto';
import {
  chunkDocument,
  computeDeterministicEmbedding64,
  formatPgVector,
} from '../src/modules/knowledge/domain/hybrid-rag';
import { calculateTokenCostUsd } from '../src/modules/finops/domain/cost-calculator';

// Lock seed for deterministic repeatability across runs
faker.seed(20261109);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops';

function sha256(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

export async function runSuperseed(): Promise<void> {
  console.log('================================================================');
  console.log('  VIGILIO LLMOPS PLATFORM — 100% SENIOR SUPERSEED');
  console.log('  Populating all operational tables across all workspaces & tenants');
  console.log('================================================================');

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // -------------------------------------------------------------------------
    // FASE 1: Identidad, Credenciales, Sesiones, MFA, Tokens y Privacidad Legal
    // -------------------------------------------------------------------------
    console.log('\n[Fase 1/8] Sembrando Identidad, MFA, Sesiones y Privacidad...');

    const basePassword = 'Password123!';
    const passwordHash = await argon2.hash(basePassword);

    const userPersonas = [
      {
        preferredId: '00000000-0000-4000-8000-000000000001',
        email: 'admin@vigilio.io',
        display_name: 'Administrador Vigilio',
        role: 'owner',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000002',
        email: 'dev@vigilio.io',
        display_name: 'Ingeniero LLMOps Lead',
        role: 'developer',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000003',
        email: 'approver@vigilio.io',
        display_name: 'Lead Compliance & QA',
        role: 'approver',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000004',
        email: 'analyst@vigilio.io',
        display_name: 'Analista FinOps & Metrics',
        role: 'analyst',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000005',
        email: 'viewer@vigilio.io',
        display_name: 'Auditor Externo ISO/SOC2',
        role: 'viewer',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000006',
        email: 'disabled@vigilio.io',
        display_name: 'Cuenta Deshabilitada',
        role: 'viewer',
        disabled: true,
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000007',
        email: 'ciso@vigilio.io',
        display_name: 'CISO Corporativo',
        role: 'approver',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000008',
        email: 'mlops@vigilio.io',
        display_name: 'Senior MLOps Platform Lead',
        role: 'developer',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000009',
        email: 'finops@vigilio.io',
        display_name: 'FinOps Controller Lead',
        role: 'analyst',
      },
      {
        preferredId: '00000000-0000-4000-8000-000000000010',
        email: 'qa.lead@vigilio.io',
        display_name: 'QA Automation Engineer',
        role: 'approver',
      },
    ];

    const userIds = new Map<string, string>();

    for (const u of userPersonas) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      let uId: string;
      if (existing.rows.length > 0) {
        uId = existing.rows[0].id;
        await client.query(
          'UPDATE users SET display_name = $2, disabled_at = $3, email_verified = true WHERE id = $1',
          [uId, u.display_name, u.disabled ? new Date() : null],
        );
      } else {
        const ins = await client.query(
          `INSERT INTO users (id, email, display_name, email_verified, disabled_at)
           VALUES ($1, $2, $3, true, $4) RETURNING id`,
          [u.preferredId, u.email, u.display_name, u.disabled ? new Date() : null],
        );
        uId = ins.rows[0].id;
      }
      userIds.set(u.email, uId);

      await client.query(
        `INSERT INTO user_credentials (user_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = $2`,
        [uId, passwordHash],
      );

      await client.query(
        `INSERT INTO user_onboarding (user_id, completed_at)
         VALUES ($1, now())
         ON CONFLICT (user_id) DO NOTHING`,
        [uId],
      );
    }
    const adminId = userIds.get('admin@vigilio.io')!;
    const devId = userIds.get('dev@vigilio.io')!;
    const approverId = userIds.get('approver@vigilio.io')!;
    console.log(`  ✓ 10 usuarios listos con credenciales Argon2id y onboarding.`);

    // user_sessions & session_rotation_history
    const sessionId = '00000000-0000-4000-8000-100000000001';
    const sessionTokenHash = sha256('seed-session-token-admin-vigilio');
    const csrfHash = sha256('seed-csrf-token-admin-vigilio');

    await client.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
       VALUES ($1, $2, $3, $4, now() + interval '30 days', now())
       ON CONFLICT (id) DO UPDATE SET user_id = $2`,
      [sessionId, adminId, sessionTokenHash, csrfHash],
    );

    await client.query(
      `INSERT INTO session_rotation_history (id, session_id, user_id, token_hash, rotated_at)
       VALUES ('00000000-0000-4000-8000-100000000002', $1, $2, $3, now() - interval '1 hour')
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, adminId, sha256('previous-rotated-session-token')],
    );
    console.log(`  ✓ user_sessions y session_rotation_history sembrados.`);

    // email_tokens & email_change_tokens
    await client.query(
      `INSERT INTO email_tokens (id, user_id, kind, token_hash, expires_at)
       VALUES ('00000000-0000-4000-8000-100000000003', $1, 'verify', $2, now() + interval '1 day')
       ON CONFLICT (id) DO UPDATE SET user_id = $1`,
      [devId, sha256('verify-dev-token')],
    );

    await client.query(
      `INSERT INTO email_change_tokens (id, user_id, next_email, token_hash, expires_at)
       VALUES ('00000000-0000-4000-8000-100000000004', $1, 'lead.dev@vigilio.io', $2, now() + interval '2 days')
       ON CONFLICT (id) DO UPDATE SET user_id = $1`,
      [devId, sha256('change-email-dev-token')],
    );
    console.log(`  ✓ email_tokens y email_change_tokens sembrados.`);

    // social_identities & oauth_transactions
    const socialIdentityId = '00000000-0000-4000-8000-100000000005';
    await client.query(
      `INSERT INTO social_identities (id, user_id, provider, subject)
       VALUES ($1, $2, 'github', 'octocat-vigilio-enterprise')
       ON CONFLICT (provider, subject) DO UPDATE SET user_id = $2`,
      [socialIdentityId, adminId],
    );

    await client.query(
      `INSERT INTO oauth_transactions (id, state_hash, cookie_hash, return_to, action, initiating_user_id, expires_at)
       VALUES ('00000000-0000-4000-8000-100000000006', $1, $2, '/app', 'link', $3, now() + interval '10 minutes')
       ON CONFLICT (state_hash) DO NOTHING`,
      [sha256('oauth-state-12345'), sha256('oauth-cookie-12345'), adminId],
    );
    console.log(`  ✓ social_identities y oauth_transactions sembrados.`);

    // mfa_factors, mfa_recovery_codes, mfa_login_challenges
    await client.query('DELETE FROM mfa_factors WHERE user_id = $1', [adminId]);
    await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [adminId]);

    const rawTotpSecret = randomBytes(20).toString('hex');
    const encryptedTotp = encryptSecret(rawTotpSecret);

    await client.query(
      `INSERT INTO mfa_factors (user_id, secret_ciphertext, activated_at, last_step)
       VALUES ($1, $2, now(), 100)
       ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = $2`,
      [approverId, encryptedTotp],
    );

    for (let c = 1; c <= 3; c++) {
      const recoveryHash = sha256(`recovery-code-sample-${c}`);
      await client.query(
        `INSERT INTO mfa_recovery_codes (user_id, code_hash, used_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, code_hash) DO NOTHING`,
        [approverId, recoveryHash, c === 3 ? new Date() : null],
      );
    }

    await client.query(
      `INSERT INTO mfa_login_challenges (id, user_id, challenge_hash, expires_at)
       VALUES ('00000000-0000-4000-8000-100000000007', $1, $2, now() + interval '5 minutes')
       ON CONFLICT (id) DO UPDATE SET user_id = $1`,
      [approverId, sha256('mfa-challenge-hash-approver')],
    );
    console.log(`  ✓ mfa_factors (AES-256-GCM), recovery codes y login challenges sembrados.`);

    // Privacidad Legal: consent_receipts, deletion_requests, data_requests
    await client.query(
      `INSERT INTO consent_receipts (id, user_id, document_version, subject_hash)
       VALUES ('00000000-0000-4000-8000-100000000008', $1, '2026.1-terms', $2)
       ON CONFLICT (id) DO UPDATE SET user_id = $1`,
      [adminId, sha256('admin@vigilio.io')],
    );

    const encDelConfirm = encryptSecret('confirmed-by-user-request-rgpd');
    await client.query(
      `INSERT INTO deletion_requests (id, identity_id, confirmation_hash, confirmation_ciphertext, request_hash, status)
       VALUES ('00000000-0000-4000-8000-100000000009', $1, $2, $3, $4, 'queued')
       ON CONFLICT (confirmation_hash) DO NOTHING`,
      [socialIdentityId, sha256('del-confirm-sample'), encDelConfirm, sha256('req-del-sample')],
    );

    await client.query(
      `INSERT INTO data_requests (id, user_id, kind, status, reason)
       VALUES ('00000000-0000-4000-8000-100000000010', $1, 'export', 'completed', 'Auditoría anual de cumplimiento RGPD / LFPDPPP')
       ON CONFLICT (id) DO UPDATE SET user_id = $1`,
      [adminId],
    );
    console.log(`  ✓ consent_receipts, deletion_requests y data_requests sembrados.`);

    // -------------------------------------------------------------------------
    // FASE 2: Tenancy Multi-Tenant, Memberships, Invitaciones y Workspaces
    // -------------------------------------------------------------------------
    console.log('\n[Fase 2/8] Sembrando Tenancy, Workspaces, Apps y API Keys...');

    let orgId = '7093745a-2609-440a-939a-98a4dd255a1d';
    const orgCheck = await client.query("SELECT id FROM organizations WHERE slug = 'vigilio-enterprise'");
    if (orgCheck.rows.length > 0) {
      orgId = orgCheck.rows[0].id;
    } else {
      await client.query(
        `INSERT INTO organizations (id, slug, name, created_by)
         VALUES ($1, 'vigilio-enterprise', 'Vigilio Enterprise', $2)
         ON CONFLICT (slug) DO UPDATE SET name = 'Vigilio Enterprise'`,
        [orgId, adminId],
      );
    }

    const secondaryOrgId = '00000000-0000-4000-8000-200000000001';
    await client.query(
      `INSERT INTO organizations (id, slug, name, created_by)
       VALUES ($1, 'acme-intelligence', 'Acme Intelligence Ltd.', $2)
       ON CONFLICT (slug) DO UPDATE SET name = 'Acme Intelligence Ltd.'`,
      [secondaryOrgId, devId],
    );

    // Memberships en Vigilio Enterprise
    for (const p of userPersonas) {
      const uId = userIds.get(p.email)!;
      await client.query(
        `INSERT INTO memberships (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3`,
        [orgId, uId, p.role],
      );
    }
    // Memberships en Acme Intelligence
    await client.query(
      `INSERT INTO memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner'`,
      [secondaryOrgId, devId],
    );
    await client.query(
      `INSERT INTO memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'approver')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'approver'`,
      [secondaryOrgId, adminId],
    );
    await client.query(
      `INSERT INTO memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'analyst')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'analyst'`,
      [secondaryOrgId, userIds.get('analyst@vigilio.io')!],
    );

    // Invitations ricas y variadas
    const invitationsData = [
      { id: '00000000-0000-4000-8000-200000000002', email: 'ciso.consultor@example.test', role: 'approver' },
      { id: '00000000-0000-4000-8000-200000000003', email: 'data.scientist@external-partner.com', role: 'developer' },
      { id: '00000000-0000-4000-8000-200000000004', email: 'secops.auditor@cybersec.org', role: 'viewer' },
      { id: '00000000-0000-4000-8000-200000000005', email: 'cost.accountant@financial-ops.com', role: 'analyst' },
    ];
    for (const inv of invitationsData) {
      await client.query(
        `INSERT INTO organization_invitations (id, organization_id, email, role, token_hash, expires_at, invited_by)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days', $6)
         ON CONFLICT (id) DO NOTHING`,
        [inv.id, orgId, inv.email, inv.role, sha256(`invite-token-${inv.email}`), adminId],
      );
    }

    // Workspaces en Vigilio Enterprise
    const wsMap = new Map<string, string>();
    for (const ws of [
      { prefId: '00000000-0000-4000-8000-200000000010', slug: 'production', name: 'Producción Oficial' },
      { prefId: '00000000-0000-4000-8000-200000000020', slug: 'staging', name: 'Staging Lab & QA' },
      { prefId: '00000000-0000-4000-8000-200000000030', slug: 'sandbox', name: 'Sandbox R&D e Innovación' },
    ]) {
      const exWs = await client.query('SELECT id FROM workspaces WHERE organization_id = $1 AND slug = $2', [orgId, ws.slug]);
      let wId: string;
      if (exWs.rows.length > 0) {
        wId = exWs.rows[0].id;
        await client.query('UPDATE workspaces SET name = $2 WHERE id = $1', [wId, ws.name]);
      } else {
        const ins = await client.query(
          `INSERT INTO workspaces (id, organization_id, slug, name)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [ws.prefId, orgId, ws.slug, ws.name],
        );
        wId = ins.rows[0].id;
      }
      wsMap.set(ws.slug, wId);
    }

    // Workspaces en Acme Intelligence
    for (const ws of [
      { prefId: '00000000-0000-4000-8000-200000000040', slug: 'core-engine', name: 'Core Intelligence Pipeline' },
      { prefId: '00000000-0000-4000-8000-200000000050', slug: 'client-sandbox', name: 'Customer Demonstration Lab' },
    ]) {
      const exWs = await client.query('SELECT id FROM workspaces WHERE organization_id = $1 AND slug = $2', [secondaryOrgId, ws.slug]);
      let wId: string;
      if (exWs.rows.length > 0) {
        wId = exWs.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO workspaces (id, organization_id, slug, name)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [ws.prefId, secondaryOrgId, ws.slug, ws.name],
        );
        wId = ins.rows[0].id;
      }
      wsMap.set(`acme-${ws.slug}`, wId);
    }

    const wsProdId = wsMap.get('production')!;
    const wsStagingId = wsMap.get('staging')!;
    const wsSandboxId = wsMap.get('sandbox')!;
    const wsAcmeCoreId = wsMap.get('acme-core-engine')!;
    console.log(`  ✓ 2 Organizaciones, memberships IAM y 5 Workspaces sembrados.`);

    // Applications, Environments y Application Keys distribuidas por Workspace
    const apps = [
      { id: '00000000-0000-4000-8000-200000000100', oId: orgId, wsId: wsProdId, name: 'Vigilio Copilot Pro', env: 'production' },
      { id: '00000000-0000-4000-8000-200000000200', oId: orgId, wsId: wsStagingId, name: 'Customer Support Bot', env: 'staging' },
      { id: '00000000-0000-4000-8000-200000000300', oId: orgId, wsId: wsProdId, name: 'Financial RAG Analyst', env: 'production' },
      { id: '00000000-0000-4000-8000-200000000400', oId: orgId, wsId: wsProdId, name: 'Executive KPI Summarizer', env: 'production' },
      { id: '00000000-0000-4000-8000-200000000500', oId: orgId, wsId: wsStagingId, name: 'Contract Intelligence Extractor', env: 'staging' },
      { id: '00000000-0000-4000-8000-200000000600', oId: orgId, wsId: wsSandboxId, name: 'Multimodal Vision Agent Lab', env: 'dev' },
      { id: '00000000-0000-4000-8000-200000000700', oId: orgId, wsId: wsSandboxId, name: 'Autonomous Code Reviewer', env: 'dev' },
      { id: '00000000-0000-4000-8000-200000000800', oId: secondaryOrgId, wsId: wsAcmeCoreId, name: 'Acme Predictive Engine', env: 'production' },
    ];

    for (const app of apps) {
      await client.query(
        `INSERT INTO applications (id, organization_id, workspace_id, name, environment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = $4, workspace_id = $3`,
        [app.id, app.oId, app.wsId, app.name, app.env],
      );

      for (const envName of ['dev', 'staging', 'production']) {
        await client.query(
          `INSERT INTO application_environments (application_id, name)
           VALUES ($1, $2)
           ON CONFLICT (application_id, name) DO NOTHING`,
          [app.id, envName],
        );
      }

      const keyPrefix = `vgl_${app.env === 'production' ? 'live' : 'test'}_${app.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4)}`;
      const keySecret = `${keyPrefix}_${randomBytes(16).toString('hex')}`;
      await client.query(
        `INSERT INTO application_keys (application_id, token_hash, prefix, scopes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token_hash) DO NOTHING`,
        [app.id, sha256(keySecret), keyPrefix, ['inference:chat', 'knowledge:read', 'telemetry:write']],
      );
    }
    const appIdCopilot = apps[0].id;
    const appIdSupport = apps[1].id;
    const appIdFinance = apps[2].id;
    const appIdKpi = apps[3].id;
    const appIdContract = apps[4].id;
    const appIdVision = apps[5].id;
    const appIdCode = apps[6].id;
    console.log(`  ✓ 8 Aplicaciones con entornos y API Keys sembradas.`);

    // -------------------------------------------------------------------------
    // FASE 3: Model Providers, Model Catalog y Model Routes
    // -------------------------------------------------------------------------
    console.log('\n[Fase 3/8] Sembrando Catálogo de Proveedores, Modelos y Rutas...');

    const providerOllamaId = '00000000-0000-4000-8000-300000000001';
    const providerOpenAiId = '00000000-0000-4000-8000-300000000002';
    const providerAnthropicId = '00000000-0000-4000-8000-300000000003';
    const providerDeepSeekId = '00000000-0000-4000-8000-300000000004';
    const providerVllmId = '00000000-0000-4000-8000-300000000005';

    const providersData = [
      { id: providerOllamaId, name: 'Ollama Local Cluster', kind: 'ollama', url: 'http://127.0.0.1:11434', key: null },
      { id: providerOpenAiId, name: 'OpenAI Production Gateway', kind: 'openai-compatible', url: 'https://api.openai.com/v1', key: 'sk-proj-mock-openai-vigilio-superseed-key' },
      { id: providerAnthropicId, name: 'Anthropic Direct Gateway', kind: 'openai-compatible', url: 'https://api.anthropic.com/v1', key: 'sk-ant-mock-anthropic-enterprise-key' },
      { id: providerDeepSeekId, name: 'DeepSeek Enterprise Gateway', kind: 'openai-compatible', url: 'https://api.deepseek.com/v1', key: 'sk-deepseek-mock-enterprise-key' },
      { id: providerVllmId, name: 'vLLM In-House GPU Cluster', kind: 'openai-compatible', url: 'http://10.0.4.15:8000/v1', key: 'sk-vllm-cluster-bearer-key' },
    ];

    for (const p of providersData) {
      const encKey = p.key ? encryptSecret(p.key) : null;
      await client.query(
        `INSERT INTO model_providers (id, organization_id, name, kind, base_url, api_key_ciphertext, enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)
         ON CONFLICT (organization_id, name) DO NOTHING`,
        [p.id, orgId, p.name, p.kind, p.url, encKey, adminId],
      );
    }

    const modelsData = [
      { id: '00000000-0000-4000-8000-300000000010', provId: providerOllamaId, name: 'qwen2.5:7b', digest: 'sha256:qwen25-7b-gguf-q4km', cap: ['chat', 'tool_calling'], ctx: 32768 },
      { id: '00000000-0000-4000-8000-300000000020', provId: providerOllamaId, name: 'llama3.2:3b', digest: 'sha256:llama32-3b-gguf-q4km', cap: ['chat'], ctx: 131072 },
      { id: '00000000-0000-4000-8000-300000000021', provId: providerOllamaId, name: 'llama3.3:70b', digest: 'sha256:llama33-70b-instruct-q8', cap: ['chat', 'tool_calling'], ctx: 131072 },
      { id: '00000000-0000-4000-8000-300000000022', provId: providerOllamaId, name: 'deepseek-r1:14b', digest: 'sha256:deepseek-r1-14b-distill', cap: ['chat', 'reasoning'], ctx: 65536 },
      { id: '00000000-0000-4000-8000-300000000030', provId: providerOpenAiId, name: 'gpt-4o-mini', digest: 'sha256:gpt-4o-mini-2024-07-18', cap: ['chat', 'vision', 'tool_calling'], ctx: 128000 },
      { id: '00000000-0000-4000-8000-300000000031', provId: providerOpenAiId, name: 'gpt-4o', digest: 'sha256:gpt-4o-2024-08-06', cap: ['chat', 'vision', 'tool_calling'], ctx: 128000 },
      { id: '00000000-0000-4000-8000-300000000040', provId: providerOpenAiId, name: 'text-embedding-3-small', digest: 'sha256:text-emb-3-small', cap: ['embeddings'], ctx: 8191 },
      { id: '00000000-0000-4000-8000-300000000041', provId: providerOpenAiId, name: 'text-embedding-3-large', digest: 'sha256:text-emb-3-large', cap: ['embeddings'], ctx: 8191 },
      { id: '00000000-0000-4000-8000-300000000050', provId: providerAnthropicId, name: 'claude-3-5-sonnet', digest: 'sha256:claude-3-5-sonnet-20241022', cap: ['chat', 'vision', 'tool_calling'], ctx: 200000 },
      { id: '00000000-0000-4000-8000-300000000051', provId: providerAnthropicId, name: 'claude-3-5-haiku', digest: 'sha256:claude-3-5-haiku-20241022', cap: ['chat', 'tool_calling'], ctx: 200000 },
      { id: '00000000-0000-4000-8000-300000000060', provId: providerDeepSeekId, name: 'deepseek-chat', digest: 'sha256:deepseek-v3-chat', cap: ['chat', 'tool_calling'], ctx: 65536 },
      { id: '00000000-0000-4000-8000-300000000061', provId: providerDeepSeekId, name: 'deepseek-reasoner', digest: 'sha256:deepseek-r1-official', cap: ['chat', 'reasoning'], ctx: 65536 },
      { id: '00000000-0000-4000-8000-300000000070', provId: providerVllmId, name: 'mistral-nemo:12b', digest: 'sha256:mistral-nemo-12b-instruct', cap: ['chat', 'tool_calling'], ctx: 128000 },
    ];

    for (const m of modelsData) {
      await client.query(
        `INSERT INTO model_catalog (id, organization_id, provider_id, name, digest, capabilities, context_window, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (provider_id, name, digest) DO NOTHING`,
        [m.id, orgId, m.provId, m.name, m.digest, m.cap, m.ctx],
      );
    }

    const modelQwenId = modelsData[0].id;
    const modelLlamaId = modelsData[1].id;
    const modelGpt4oMiniId = modelsData[4].id;
    const modelClaudeSonnetId = modelsData[8].id;

    // Model routes para todas las apps en todos los ambientes
    for (const app of apps) {
      for (const env of ['dev', 'staging', 'production']) {
        const primary = env === 'production' ? modelGpt4oMiniId : modelQwenId;
        const fallback = env === 'production' ? modelClaudeSonnetId : modelLlamaId;
        await client.query(
          `INSERT INTO model_routes (organization_id, application_id, environment, model_id, fallback_model_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (application_id, environment) DO UPDATE SET model_id = $4, fallback_model_id = $5`,
          [app.oId, app.id, env, primary, fallback],
        );
      }
    }
    console.log(`  ✓ 5 Proveedores, 13 modelos enterprise y model_routes sembrados.`);

    // -------------------------------------------------------------------------
    // FASE 4: Prompts, Versiones y Datasets Reproducibles en Múltiples Workspaces
    // -------------------------------------------------------------------------
    console.log('\n[Fase 4/8] Sembrando Prompts, Datasets y Evaluadores en todos los Workspaces...');

    const promptsData = [
      // En Producción
      {
        id: '00000000-0000-4000-8000-400000000001',
        wsId: wsProdId,
        appId: appIdSupport,
        name: 'customer-support-agent',
        desc: 'Agente de atención y triaje para incidencias B2B con grounding en base de conocimiento',
        versions: [
          { v: 1, model: 'qwen2.5:7b', tpl: 'Eres un asistente técnico útil de Vigilio. Responde cordialmente: {{input}}' },
          { v: 2, model: 'gpt-4o-mini', tpl: 'Eres un agente senior de Vigilio LLMOps. Cita siempre fuentes oficiales y abstente si no tienes contexto. Consulta: {{input}}' },
          { v: 3, model: 'claude-3-5-sonnet', tpl: 'Eres el copiloto principal de soporte B2B Vigilio. Brinda respuestas concisas con pasos de resolución y citas del manual. Entrada: {{input}}' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000002',
        wsId: wsProdId,
        appId: appIdFinance,
        name: 'financial-advisor-prompt',
        desc: 'Analista de rentabilidad, proyecciones FinOps y conciliación de presupuesto en tiempo real',
        versions: [
          { v: 1, model: 'gpt-4o-mini', tpl: 'Calcula el balance y consumo de tokens para la consulta: {{input}}' },
          { v: 2, model: 'claude-3-5-sonnet', tpl: 'Actúa como Director FinOps de Vigilio. Analiza los costes con aritmética de punto fijo a escala 100M. Solicitud: {{input}}' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000003',
        wsId: wsProdId,
        appId: appIdKpi,
        name: 'executive-kpi-brief',
        desc: 'Resumen ejecutivo estructurado con balance scorecard y KPIs operativos para el C-Level',
        versions: [
          { v: 1, model: 'qwen2.5:7b', tpl: 'Genera un resumen ejecutivo de las métricas clave: {{input}}' },
          { v: 2, model: 'gpt-4o', tpl: 'Redacta un memo ejecutivo con formato Markdown estructurado (Resumen, Riesgos, Acciones Inmediatas) para: {{input}}' },
        ],
      },
      // En Staging
      {
        id: '00000000-0000-4000-8000-400000000004',
        wsId: wsStagingId,
        appId: appIdSupport,
        name: 'support-triage-beta',
        desc: 'Triaje automatizado con clasificación jerárquica de tickets de soporte técnico',
        versions: [
          { v: 1, model: 'qwen2.5:7b', tpl: 'Clasifica el ticket en severidad sev1/sev2/sev3: {{input}}' },
          { v: 2, model: 'llama3.2:3b', tpl: 'Evalúa la urgencia del cliente y extrae la entidad afectada del ticket: {{input}}' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000005',
        wsId: wsStagingId,
        appId: appIdContract,
        name: 'contract-risk-scanner',
        desc: 'Extractor de cláusulas de responsabilidad y penalidades en contratos SaaS',
        versions: [
          { v: 1, model: 'deepseek-chat', tpl: 'Extrae las cláusulas de limitación de responsabilidad del contrato: {{input}}' },
          { v: 2, model: 'gpt-4o-mini', tpl: 'Identifica penalidades de SLA y plazos de preaviso en el documento legal: {{input}}' },
        ],
      },
      // En Sandbox
      {
        id: '00000000-0000-4000-8000-400000000006',
        wsId: wsSandboxId,
        appId: appIdVision,
        name: 'multimodal-vision-qa',
        desc: 'Inspección de diagramas de arquitectura e interfaces UI con modelos visuales',
        versions: [
          { v: 1, model: 'gpt-4o', tpl: 'Describe detalladamente la topología de red visualizada: {{input}}' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000007',
        wsId: wsSandboxId,
        appId: appIdCode,
        name: 'git-commit-summarizer',
        desc: 'Generador de changelog semántico con Conventional Commits a partir de diffs',
        versions: [
          { v: 1, model: 'qwen2.5:7b', tpl: 'Resume el siguiente diff en un mensaje de commit semántico: {{input}}' },
        ],
      },
    ];

    const promptIdMap = new Map<string, string>();
    const promptVersionMap = new Map<string, string>();

    for (const p of promptsData) {
      const pRes = await client.query(
        `INSERT INTO prompts (id, organization_id, workspace_id, application_id, name, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, name) DO UPDATE SET description = $6
         RETURNING id`,
        [p.id, orgId, p.wsId, p.appId, p.name, p.desc, adminId],
      );
      const actualPromptId = pRes.rows[0].id;
      promptIdMap.set(p.name, actualPromptId);

      for (const ver of p.versions) {
        const pvId = `00000000-0000-4000-8000-400000${p.id.slice(-4)}${ver.v.toString().padStart(2, '0')}`;
        const pvRes = await client.query(
          `INSERT INTO prompt_versions (id, prompt_id, version, template, model, parameters, sha256, created_by)
           VALUES ($1, $2, $3, $4, $5, '{"temperature": 0.2, "max_tokens": 2048}'::jsonb, $6, $7)
           ON CONFLICT (prompt_id, version) DO UPDATE SET template = $4, model = $5, sha256 = $6
           RETURNING id`,
          [pvId, actualPromptId, ver.v, ver.tpl, ver.model, sha256(ver.tpl), adminId],
        );
        promptVersionMap.set(`${p.name}:v${ver.v}`, pvRes.rows[0].id);
      }

      // Aliases
      const latestVer = p.versions[p.versions.length - 1]!;
      const latestVerId = promptVersionMap.get(`${p.name}:v${latestVer.v}`)!;
      const firstVerId = promptVersionMap.get(`${p.name}:v1`)!;

      await client.query(
        `INSERT INTO prompt_aliases (prompt_id, environment, prompt_version_id, assigned_by)
         VALUES ($1, 'production', $2, $3)
         ON CONFLICT (prompt_id, environment) DO UPDATE SET prompt_version_id = $2`,
        [actualPromptId, latestVerId, adminId],
      );
      await client.query(
        `INSERT INTO prompt_aliases (prompt_id, environment, prompt_version_id, assigned_by)
         VALUES ($1, 'staging', $2, $3)
         ON CONFLICT (prompt_id, environment) DO UPDATE SET prompt_version_id = $2`,
        [actualPromptId, latestVerId, adminId],
      );
      await client.query(
        `INSERT INTO prompt_aliases (prompt_id, environment, prompt_version_id, assigned_by)
         VALUES ($1, 'dev', $2, $3)
         ON CONFLICT (prompt_id, environment) DO UPDATE SET prompt_version_id = $2`,
        [actualPromptId, firstVerId, adminId],
      );
    }
    console.log(`  ✓ 7 Prompts con 14 versiones y aliases repartidos por todos los Workspaces.`);

    // Datasets reproducibles distribuidos por Workspace
    const datasetsData = [
      // En Producción
      {
        id: '00000000-0000-4000-8000-400000000100',
        wsId: wsProdId,
        appId: appIdSupport,
        name: 'support-grounding-golden-v1',
        cases: [
          { in: '¿Cómo configuro el SSO corporativo en Vigilio?', exp: 'Navega a Configuración > IAM > SSO OIDC y carga el Client ID y Discovery URL.' },
          { in: '¿Qué algoritmo de cifrado protege las API Keys?', exp: 'Se utiliza AES-256-GCM con rotación por keyring y hash SHA-256 en almacenamiento.' },
          { in: '¿Cuál es la política de tolerancia en conciliación FinOps?', exp: 'La contabilidad en punto fijo exige cero tolerancia de desviación frente al ledger.' },
          { in: '¿Cómo se garantiza la inmutabilidad de versiones de prompts?', exp: 'Cada versión calcula un hash SHA-256 criptográfico que previene cualquier mutación posterior.' },
          { in: '¿Qué métrica determina la aprobación en Quality Gates?', exp: 'El umbral de minimum_score configurado en la política de calidad correspondiente.' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000200',
        wsId: wsProdId,
        appId: appIdFinance,
        name: 'finops-accounting-bench-v1',
        cases: [
          { in: 'Calcular costo para 1000 input tokens en gpt-4o-mini a 0.15 USD/M', exp: '0.00015000 USD' },
          { in: 'Calcular costo de 5000 tokens en cluster Ollama local', exp: '0.00000000 USD costo de inferencia de proveedor.' },
          { in: '¿Qué ocurre al exceder el límite presupuestario configurado?', exp: 'Las reservas atómicas subsiguientes son denegadas con HTTP 402/403 BudgetExceeded.' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000300',
        wsId: wsProdId,
        appId: appIdKpi,
        name: 'compliance-gdpr-dataset',
        cases: [
          { in: 'Verificar protocolo de derecho al olvido RGPD', exp: 'Se anonimizan datos identificables y se emite recibo criptográfico de eliminación.' },
          { in: 'Política de retención de telemetría de trazas', exp: 'Retención máxima configurable de 90 días con muestreo probabilístico adaptativo.' },
        ],
      },
      // En Staging
      {
        id: '00000000-0000-4000-8000-400000000400',
        wsId: wsStagingId,
        appId: appIdSupport,
        name: 'support-regression-suite',
        cases: [
          { in: 'Error 500 intermitente al invocar modelo Anthropic', exp: 'Sev2: Falla de Gateway externo, activar fallback automático.' },
          { in: 'Consulta de facturación del periodo anterior', exp: 'Sev3: Derivar al módulo FinOps o descargar extracto PDF.' },
          { in: 'Caída general del nodo GPU de inferencia', exp: 'Sev1: Activar failover a cluster redundante inmediatamente.' },
        ],
      },
      {
        id: '00000000-0000-4000-8000-400000000500',
        wsId: wsStagingId,
        appId: appIdContract,
        name: 'contract-clause-extraction',
        cases: [
          { in: 'Cláusula de penalidad por SLA menor al 99.9%', exp: 'Compensación del 10% de la cuota mensual recurrente.' },
          { in: 'Plazo para notificación de rescisión contractual', exp: 'Preaviso obligatorio por escrito de 30 días naturales.' },
        ],
      },
      // En Sandbox
      {
        id: '00000000-0000-4000-8000-400000000600',
        wsId: wsSandboxId,
        appId: appIdVision,
        name: 'vision-ocr-benchmark',
        cases: [
          { in: 'Identificar componentes en diagrama de arquitectura Caddy + NestJS', exp: 'Proxy Caddy TLS Edge enrutando hacia clúster NestJS y Valkey.' },
        ],
      },
    ];

    const datasetVersionMap = new Map<string, string>();
    const datasetCaseMap = new Map<string, string[]>();

    for (const ds of datasetsData) {
      await client.query(
        `INSERT INTO datasets (id, organization_id, workspace_id, application_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [ds.id, orgId, ds.wsId, ds.appId, ds.name, adminId],
      );

      const caseIds: string[] = [];
      for (let idx = 0; idx < ds.cases.length; idx++) {
        const c = ds.cases[idx]!;
        const cId = `00000000-0000-4000-8000-400000${ds.id.slice(-4)}${(idx + 1).toString().padStart(2, '0')}`;
        await client.query(
          `INSERT INTO dataset_cases (id, dataset_id, input, expected_output)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [cId, ds.id, c.in, c.exp],
        );
        caseIds.push(cId);
      }
      datasetCaseMap.set(ds.name, caseIds);

      const dVerId = `00000000-0000-4000-8000-400000${ds.id.slice(-4)}99`;
      const dsDigest = sha256(ds.cases.map(c => `${c.in}=>${c.exp}`).join('::'));
      const dVerRes = await client.query(
        `INSERT INTO dataset_versions (id, dataset_id, version, content_digest, case_count, created_by)
         VALUES ($1, $2, 1, $3, $4, $5)
         ON CONFLICT (dataset_id, version) DO UPDATE SET content_digest = $3, case_count = $4
         RETURNING id`,
        [dVerId, ds.id, dsDigest, ds.cases.length, adminId],
      );
      const actualDVerId = dVerRes.rows[0].id;
      datasetVersionMap.set(ds.name, actualDVerId);

      for (let ord = 0; ord < ds.cases.length; ord++) {
        const c = ds.cases[ord]!;
        await client.query(
          `INSERT INTO dataset_version_cases (dataset_version_id, ordinal, case_id, input, expected_output)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (dataset_version_id, ordinal) DO NOTHING`,
          [actualDVerId, ord, caseIds[ord], c.in, c.exp],
        );
      }

      await client.query(
        `INSERT INTO dataset_imports (id, dataset_id, status, inserted)
         VALUES ($1, $2, 'completed', $3)
         ON CONFLICT (id) DO NOTHING`,
        [`00000000-0000-4000-8000-400000${ds.id.slice(-4)}88`, ds.id, ds.cases.length],
      );
    }
    console.log(`  ✓ 6 Datasets con versiones y casos reproducibles sembrados.`);

    // -------------------------------------------------------------------------
    // FASE 5: Evaluadores, Corridas de Evaluación, Calidad y Releases
    // -------------------------------------------------------------------------
    console.log('\n[Fase 5/8] Sembrando Evaluadores, Quality Gates y Releases en Producción y Staging...');

    const evaluatorsData = [
      // En Producción
      { id: '00000000-0000-4000-8000-500000000001', wsId: wsProdId, name: 'groundedness-exact-matcher', kind: 'exact_match', rubric: '{"trim": true, "case_sensitive": false}' },
      { id: '00000000-0000-4000-8000-500000000002', wsId: wsProdId, name: 'semantic-similarity-rubric', kind: 'contains', rubric: '{"keywords": ["Vigilio", "AES-256-GCM", "FinOps"]}' },
      { id: '00000000-0000-4000-8000-500000000003', wsId: wsProdId, name: 'regex-json-schema-guard', kind: 'regex', rubric: '{"pattern": "^\\\\{.*\\\\}$"}' },
      { id: '00000000-0000-4000-8000-500000000004', wsId: wsProdId, name: 'toxicity-safety-evaluator', kind: 'exact_match', rubric: '{"forbidden_terms": ["vulnerabilidad", "bypass"]}' },
      // En Staging
      { id: '00000000-0000-4000-8000-500000000005', wsId: wsStagingId, name: 'staging-triage-matcher', kind: 'exact_match', rubric: '{"trim": true}' },
      { id: '00000000-0000-4000-8000-500000000006', wsId: wsStagingId, name: 'contract-sla-evaluator', kind: 'contains', rubric: '{"keywords": ["SLA", "penalidad", "preaviso"]}' },
    ];

    const evalIdMap = new Map<string, string>();
    const evalVerMap = new Map<string, string>();

    for (const ev of evaluatorsData) {
      const evRes = await client.query(
        `INSERT INTO evaluators (id, organization_id, workspace_id, name, kind, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (workspace_id, name) DO UPDATE SET kind = $5
         RETURNING id`,
        [ev.id, orgId, ev.wsId, ev.name, ev.kind, adminId],
      );
      const actualEvId = evRes.rows[0].id;
      evalIdMap.set(ev.name, actualEvId);

      const evVerId = `00000000-0000-4000-8000-500000${ev.id.slice(-4)}11`;
      const evVerRes = await client.query(
        `INSERT INTO evaluator_versions (id, evaluator_id, version, rubric, sha256, created_by)
         VALUES ($1, $2, 1, $3::jsonb, $4, $5)
         ON CONFLICT (evaluator_id, version) DO UPDATE SET rubric = $3::jsonb, sha256 = $4
         RETURNING id`,
        [evVerId, actualEvId, ev.rubric, sha256(ev.rubric), adminId],
      );
      evalVerMap.set(ev.name, evVerRes.rows[0].id);
    }

    // Evaluation runs ricas con diversidad de resultados
    const evalRuns = [
      // Prod runs
      {
        id: '00000000-0000-4000-8000-500000000010',
        wsId: wsProdId,
        dsName: 'support-grounding-golden-v1',
        pvKey: 'customer-support-agent:v2',
        evName: 'groundedness-exact-matcher',
        status: 'passed',
        score: '0.960000',
        total: 5,
        passed: 5,
      },
      {
        id: '00000000-0000-4000-8000-500000000020',
        wsId: wsProdId,
        dsName: 'support-grounding-golden-v1',
        pvKey: 'customer-support-agent:v1',
        evName: 'groundedness-exact-matcher',
        status: 'passed',
        score: '0.820000',
        total: 5,
        passed: 4,
      },
      {
        id: '00000000-0000-4000-8000-500000000030',
        wsId: wsProdId,
        dsName: 'finops-accounting-bench-v1',
        pvKey: 'financial-advisor-prompt:v2',
        evName: 'semantic-similarity-rubric',
        status: 'passed',
        score: '0.980000',
        total: 3,
        passed: 3,
      },
      {
        id: '00000000-0000-4000-8000-500000000040',
        wsId: wsProdId,
        dsName: 'compliance-gdpr-dataset',
        pvKey: 'customer-support-agent:v3',
        evName: 'toxicity-safety-evaluator',
        status: 'passed',
        score: '0.950000',
        total: 2,
        passed: 2,
      },
      {
        id: '00000000-0000-4000-8000-500000000050',
        wsId: wsProdId,
        dsName: 'support-grounding-golden-v1',
        pvKey: 'customer-support-agent:v1',
        evName: 'regex-json-schema-guard',
        status: 'failed',
        score: '0.650000',
        total: 5,
        passed: 3,
      },
      // Staging runs
      {
        id: '00000000-0000-4000-8000-500000000060',
        wsId: wsStagingId,
        dsName: 'support-regression-suite',
        pvKey: 'support-triage-beta:v2',
        evName: 'staging-triage-matcher',
        status: 'passed',
        score: '0.920000',
        total: 3,
        passed: 3,
      },
      {
        id: '00000000-0000-4000-8000-500000000070',
        wsId: wsStagingId,
        dsName: 'contract-clause-extraction',
        pvKey: 'contract-risk-scanner:v2',
        evName: 'contract-sla-evaluator',
        status: 'passed',
        score: '0.890000',
        total: 2,
        passed: 2,
      },
    ];

    for (const r of evalRuns) {
      const dsId = datasetsData.find(d => d.name === r.dsName)!.id;
      const dVerId = datasetVersionMap.get(r.dsName)!;
      const pvId = promptVersionMap.get(r.pvKey)!;
      const evVerId = evalVerMap.get(r.evName)!;

      await client.query(
        `INSERT INTO evaluation_runs (id, organization_id, workspace_id, dataset_id, dataset_version_id, prompt_version_id, evaluator_version_id, status, score, total_cases, passed_cases, created_by, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
         ON CONFLICT (id) DO NOTHING`,
        [r.id, orgId, r.wsId, dsId, dVerId, pvId, evVerId, r.status, r.score, r.total, r.passed, adminId],
      );

      const cases = datasetCaseMap.get(r.dsName) ?? [];
      for (const cId of cases) {
        await client.query(
          `INSERT INTO evaluation_results (run_id, case_id, passed, actual_output, notes)
           VALUES ($1, $2, $3, 'Salida generada verificada satisfactoriamente por el worker de evaluación', 'Aprobado')
           ON CONFLICT (run_id, case_id) DO NOTHING`,
          [r.id, cId, r.status === 'passed'],
        );
      }
    }

    // Comparison A/B
    await client.query(
      `INSERT INTO evaluation_comparisons (organization_id, workspace_id, baseline_run_id, candidate_run_id, baseline_score, candidate_score, score_delta, created_by)
       VALUES ($1, $2, $3, $4, 0.820000, 0.960000, 0.140000, $5)
       ON CONFLICT (id) DO NOTHING`,
      [orgId, wsProdId, evalRuns[1].id, evalRuns[0].id, adminId],
    );

    // Annotations
    await client.query(
      `INSERT INTO evaluation_annotations (run_id, case_id, score, notes, author_id)
       VALUES ($1, $2, true, 'Verificado por el equipo de QA en Staging y firmado para Release', $3)
       ON CONFLICT (id) DO NOTHING`,
      [evalRuns[0].id, datasetCaseMap.get('support-grounding-golden-v1')![0], approverId],
    );

    // Quality Policies en Producción y Staging
    const qualityPolicies = [
      // En Producción
      { id: '00000000-0000-4000-8000-500000000100', wsId: wsProdId, name: 'Enterprise Production Gate (>=90%)', min: '0.900000' },
      { id: '00000000-0000-4000-8000-500000000101', wsId: wsProdId, name: 'Critical FinOps Accuracy Gate (>=95%)', min: '0.950000' },
      { id: '00000000-0000-4000-8000-500000000102', wsId: wsProdId, name: 'Staging Canary Gate (>=80%)', min: '0.800000' },
      // En Staging
      { id: '00000000-0000-4000-8000-500000000103', wsId: wsStagingId, name: 'Staging Permissive Gate (>=75%)', min: '0.750000' },
    ];

    for (const qp of qualityPolicies) {
      await client.query(
        `INSERT INTO quality_policies (id, organization_id, workspace_id, name, minimum_score, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [qp.id, orgId, qp.wsId, qp.name, qp.min, adminId],
      );

      await client.query(
        `INSERT INTO quality_policy_versions (policy_id, version, minimum_score, created_by)
         VALUES ($1, 1, $2, $3)
         ON CONFLICT (policy_id, version) DO NOTHING`,
        [qp.id, qp.min, adminId],
      );
    }

    // Releases & Workflow Events
    const releasesData = [
      {
        id: '00000000-0000-4000-8000-500000000200',
        wsId: wsProdId,
        promptName: 'customer-support-agent',
        pvId: promptVersionMap.get('customer-support-agent:v2')!,
        evalId: evalRuns[0].id,
        policyId: qualityPolicies[0].id,
        status: 'active',
        threshold: '0.900000',
      },
      {
        id: '00000000-0000-4000-8000-500000000201',
        wsId: wsProdId,
        promptName: 'financial-advisor-prompt',
        pvId: promptVersionMap.get('financial-advisor-prompt:v2')!,
        evalId: evalRuns[2].id,
        policyId: qualityPolicies[1].id,
        status: 'active',
        threshold: '0.950000',
      },
      {
        id: '00000000-0000-4000-8000-500000000202',
        wsId: wsProdId,
        promptName: 'customer-support-agent',
        pvId: promptVersionMap.get('customer-support-agent:v1')!,
        evalId: evalRuns[1].id,
        policyId: qualityPolicies[2].id,
        status: 'rolled_back',
        threshold: '0.800000',
      },
      {
        id: '00000000-0000-4000-8000-500000000203',
        wsId: wsStagingId,
        promptName: 'support-triage-beta',
        pvId: promptVersionMap.get('support-triage-beta:v2')!,
        evalId: evalRuns[5].id,
        policyId: qualityPolicies[3].id,
        status: 'active',
        threshold: '0.750000',
      },
    ];

    for (const rel of releasesData) {
      const promptId = promptIdMap.get(rel.promptName)!;
      await client.query(
        `INSERT INTO releases (id, organization_id, workspace_id, prompt_id, environment, prompt_version_id, evaluation_run_id, policy_id, status, policy_threshold_snapshot, created_by, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, 'production', $5, $6, $7, $8, $9, $10, $11, now() - interval '2 days')
         ON CONFLICT (id) DO UPDATE SET status = $8`,
        [rel.id, orgId, rel.wsId, promptId, rel.pvId, rel.evalId, rel.policyId, rel.status, rel.threshold, adminId, approverId],
      );

      for (const act of [
        { action: 'created', actor: adminId, detail: '{"commit": "init-draft"}' },
        { action: 'verified', actor: devId, detail: '{"eval_score": 0.95}' },
        { action: 'approved', actor: approverId, detail: '{"compliance_signoff": true}' },
        { action: 'activated', actor: adminId, detail: '{"traffic": "100%"}' },
      ]) {
        await client.query(
          `INSERT INTO release_workflow_events (release_id, action, actor_id, detail)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [rel.id, act.action, act.actor, act.detail],
        );
      }
    }
    console.log(`  ✓ 6 Evaluadores, 7 Corridas, 4 Quality Policies y 4 Releases sembradas.`);

    // -------------------------------------------------------------------------
    // FASE 6: Hybrid RAG (`pgvector` + FTS + RRF) y ACL Documental
    // -------------------------------------------------------------------------
    console.log('\n[Fase 6/8] Sembrando Bases de Conocimiento, Documentos, Chunks y ACL...');

    const kbsData = [
      { id: '00000000-0000-4000-8000-600000000001', wsId: wsProdId, name: 'Base de Conocimiento Corporativa Vigilio' },
      { id: '00000000-0000-4000-8000-600000000002', wsId: wsProdId, name: 'Vigilio FinOps & Pricing Standards' },
      { id: '00000000-0000-4000-8000-600000000003', wsId: wsStagingId, name: 'Knowledge Base de QA y Staging Lab' },
      { id: '00000000-0000-4000-8000-600000000004', wsId: wsSandboxId, name: 'Sandbox Experimental AI Docs' },
    ];

    for (const kb of kbsData) {
      await client.query(
        `INSERT INTO knowledge_bases (id, organization_id, workspace_id, name, embedding_model, embedding_model_digest, created_by)
         VALUES ($1, $2, $3, $4, 'builtin-hash-64', 'sha256:vigilio-hash64-v1', $5)
         ON CONFLICT (id) DO UPDATE SET name = $4`,
        [kb.id, orgId, kb.wsId, kb.name, adminId],
      );
    }

    const docsData = [
      // En KB 1 (Producción)
      {
        id: '00000000-0000-4000-8000-600000000010',
        kbId: kbsData[0].id,
        title: 'POL-01: Manual de Seguridad y Credenciales en Reposo',
        content: `La plataforma Vigilio LLMOps implementa cifrado simétrico autenticado AES-256-GCM para almacenar credenciales de modelos externos, secretos de proveedores y tokens sensibles. El proceso utiliza un vector de inicialización de 12 bytes aleatorio por cada registro y un tag de autenticación de 16 bytes. Ninguna clave estática o token de proveedor debe incluirse en commits de Git ni en variables accesibles públicamente.`,
        visibility: 'workspace',
      },
      {
        id: '00000000-0000-4000-8000-600000000020',
        kbId: kbsData[0].id,
        title: 'POL-02: Protocolo de Contabilidad y FinOps de Tokens',
        content: `El motor de FinOps efectúa reservas previas atómicas con bloqueo pesimista en PostgreSQL utilizando sentencias SELECT FOR UPDATE sobre la tabla budget_policies. Los costos se computan mediante aritmética en punto fijo con enteros de 64 bits a escala de 100,000,000 para prevenir desviaciones por coma flotante IEEE 754. Las llamadas locales a clusters de Ollama computan costo cero de proveedor de red.`,
        visibility: 'workspace',
      },
      {
        id: '00000000-0000-4000-8000-600000000030',
        kbId: kbsData[0].id,
        title: 'POL-03: Auditoría Restringida para Miembros Ejecutivos',
        content: `Los registros de supresión de datos bajo normativas RGPD y LFPDPPP se gestionan con recibos criptográficos inmutables. Esta información se encuentra restringida a propietarios y delegados de protección de datos (DPO). Las solicitudes de eliminación anonimizan los registros de usuarios pero preservan la validez de los recibos de consentimiento previos.`,
        visibility: 'restricted',
      },
      {
        id: '00000000-0000-4000-8000-600000000040',
        kbId: kbsData[0].id,
        title: 'SOP-04: Guía de Respuesta ante Incidentes de Inferencia y Fallback',
        content: `Cuando el Gateway detecta errores de red o códigos HTTP 429 de proveedores externos, conmuta instantáneamente al fallback configurado en model_routes. Si ambos proveedores fallan, se encola la solicitud en NATS JetStream para reintento con backoff exponencial.`,
        visibility: 'workspace',
      },
      // En KB 2 (FinOps Standards)
      {
        id: '00000000-0000-4000-8000-600000000050',
        kbId: kbsData[1].id,
        title: 'FIN-01: Tarifario Vigilio Cloud y Descuentos por Volumen',
        content: `Las tablas de precios registran tarifas de entrada y salida por millón de tokens. Se aplican descuentos progresivos a organizaciones con facturación consolidada superior a 500M de tokens mensuales.`,
        visibility: 'workspace',
      },
      // En KB 3 (Staging)
      {
        id: '00000000-0000-4000-8000-600000000060',
        kbId: kbsData[2].id,
        title: 'QA-01: Criterios de Aceptación para Agentes en Staging',
        content: `Todo agente debe alcanzar una concordancia mínima del 85% contra el dataset de regresión sintético antes de ser elegible para promoción a producción en releases.tsx.`,
        visibility: 'workspace',
      },
      // En KB 4 (Sandbox)
      {
        id: '00000000-0000-4000-8000-600000000070',
        kbId: kbsData[3].id,
        title: 'RND-01: Evaluación de Modelos Reasoning DeepSeek R1',
        content: `Pruebas comparativas de costo versus latencia para razonamiento matemático complejo y desestructuración de esquemas JSON en entornos sandbox aislados.`,
        visibility: 'workspace',
      },
    ];

    for (const doc of docsData) {
      await client.query(
        `INSERT INTO knowledge_documents (id, knowledge_base_id, title, content, visibility, search_vector, created_by)
         VALUES ($1, $2, $3, $4, $5, to_tsvector('simple', $4), $6)
         ON CONFLICT (id) DO UPDATE SET title = $3, content = $4`,
        [doc.id, doc.kbId, doc.title, doc.content, doc.visibility, adminId],
      );

      const chunks = chunkDocument(doc.content, 250, 40);
      for (const ch of chunks) {
        const emb = computeDeterministicEmbedding64(ch.chunk_content);
        const pgVec = formatPgVector(emb);
        const chunkId = `00000000-0000-4000-8000-60000000${doc.id.slice(-2)}${ch.ordinal.toString().padStart(2, '0')}`;

        await client.query(
          `INSERT INTO knowledge_chunks (id, document_id, knowledge_base_id, ordinal, chunk_index, chunk_content, content, token_count, embedding_model_digest, embedding, search_vector, tsv)
           VALUES ($1, $2, $3, $4, $4, $5, $5, $6, 'sha256:vigilio-hash64-v1', $7::vector, to_tsvector('simple', $5), to_tsvector('simple', $5))
           ON CONFLICT (id) DO UPDATE SET chunk_content = $5, embedding = $7::vector`,
          [chunkId, doc.id, doc.kbId, ch.ordinal, ch.chunk_content, Math.ceil(ch.chunk_content.length / 4), pgVec],
        );
      }

      await client.query(
        `INSERT INTO knowledge_document_acl (id, document_id, user_id, role, principal_type, principal_value, granted_by)
         VALUES ($1, $2, $3, 'editor', 'role', 'admin', $4)
         ON CONFLICT (id) DO NOTHING`,
        [`00000000-0000-4000-8000-600000000a${doc.id.slice(-2)}`, doc.id, adminId, adminId],
      );
    }

    for (const kb of kbsData) {
      await client.query(
        `INSERT INTO knowledge_jobs (id, knowledge_base_id, status)
         VALUES ($1, $2, 'completed')
         ON CONFLICT (id) DO NOTHING`,
        [`00000000-0000-4000-8000-6000000009${kb.id.slice(-2)}`, kb.id],
      );
    }
    console.log(`  ✓ 4 Bases de conocimiento, 7 documentos con pgvector(64) + ACL sembrados.`);

    // -------------------------------------------------------------------------
    // FASE 7: FinOps Transaccional, Price Cards, Ledger Cuadrado y Telemetría
    // -------------------------------------------------------------------------
    console.log('\n[Fase 7/8] Sembrando FinOps (Ledger cuadrado al centésimo), Gateway y Trazas...');

    const priceCardsData = [
      { id: '00000000-0000-4000-8000-700000000001', model: 'gpt-4o-mini', inPrice: '0.15000000', outPrice: '0.60000000' },
      { id: '00000000-0000-4000-8000-700000000002', model: 'qwen2.5:7b', inPrice: '0.00000000', outPrice: '0.00000000' },
      { id: '00000000-0000-4000-8000-700000000003', model: 'claude-3-5-sonnet', inPrice: '3.00000000', outPrice: '15.00000000' },
      { id: '00000000-0000-4000-8000-700000000004', model: 'gpt-4o', inPrice: '2.50000000', outPrice: '10.00000000' },
      { id: '00000000-0000-4000-8000-700000000005', model: 'deepseek-chat', inPrice: '0.14000000', outPrice: '0.28000000' },
      { id: '00000000-0000-4000-8000-700000000006', model: 'llama3.3:70b', inPrice: '0.00000000', outPrice: '0.00000000' },
    ];

    for (const pc of priceCardsData) {
      await client.query(
        `INSERT INTO price_cards (id, organization_id, model, price_input_per_million, price_output_per_million, effective_from, created_by)
         VALUES ($1, $2, $3, $4, $5, now() - interval '60 days', $6)
         ON CONFLICT (id) DO NOTHING`,
        [pc.id, orgId, pc.model, pc.inPrice, pc.outPrice, adminId],
      );
    }

    let totalSettledLedgerScaled = 0n;
    let totalOutstandingReservedScaled = 0n;

    const reservations = [
      { id: '00000000-0000-4000-8000-700000000101', idem: 'idem-res-001', model: 'gpt-4o-mini', status: 'settled', inTokens: 1250, outTokens: 480, hoursAgo: 48 },
      { id: '00000000-0000-4000-8000-700000000102', idem: 'idem-res-002', model: 'gpt-4o-mini', status: 'settled', inTokens: 3400, outTokens: 1200, hoursAgo: 36 },
      { id: '00000000-0000-4000-8000-700000000103', idem: 'idem-res-003', model: 'gpt-4o-mini', status: 'reserved', inTokens: 2000, outTokens: 800, hoursAgo: 2 },
      { id: '00000000-0000-4000-8000-700000000104', idem: 'idem-res-004', model: 'qwen2.5:7b', status: 'settled', inTokens: 5000, outTokens: 2500, hoursAgo: 24 },
      { id: '00000000-0000-4000-8000-700000000105', idem: 'idem-res-005', model: 'gpt-4o-mini', status: 'cancelled', inTokens: 1000, outTokens: 0, hoursAgo: 12 },
      { id: '00000000-0000-4000-8000-700000000106', idem: 'idem-res-006', model: 'claude-3-5-sonnet', status: 'settled', inTokens: 2400, outTokens: 850, hoursAgo: 18 },
      { id: '00000000-0000-4000-8000-700000000107', idem: 'idem-res-007', model: 'gpt-4o', status: 'settled', inTokens: 1800, outTokens: 600, hoursAgo: 8 },
      { id: '00000000-0000-4000-8000-700000000108', idem: 'idem-res-008', model: 'deepseek-chat', status: 'settled', inTokens: 4200, outTokens: 1500, hoursAgo: 4 },
      { id: '00000000-0000-4000-8000-700000000109', idem: 'idem-res-009', model: 'claude-3-5-sonnet', status: 'settled', inTokens: 3100, outTokens: 920, hoursAgo: 1 },
      { id: '00000000-0000-4000-8000-700000000110', idem: 'idem-res-010', model: 'gpt-4o-mini', status: 'settled', inTokens: 1950, outTokens: 710, hoursAgo: 1 },
    ];

    for (const r of reservations) {
      const pc = priceCardsData.find(p => p.model === r.model)!;
      const cost = calculateTokenCostUsd(r.inTokens, r.outTokens, pc.inPrice, pc.outPrice);

      await client.query(
        `INSERT INTO budget_reservations (id, organization_id, idempotency_key, estimated_usd, status, created_at)
         VALUES ($1, $2, $3, $4, $5, now() - interval '${r.hoursAgo} hours')
         ON CONFLICT (organization_id, idempotency_key) DO UPDATE SET status = $5, estimated_usd = $4`,
        [r.id, orgId, r.idem, cost.budgetUsd6, r.status],
      );

      if (r.status === 'settled') {
        const ledgerId = `00000000-0000-4000-8000-7000000002${r.id.slice(-2)}`;
        await client.query(
          `INSERT INTO cost_ledger_entries (id, organization_id, workspace_id, application_id, reservation_id, model, source, input_tokens, output_tokens, amount_usd, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'gateway', $7, $8, $9, now() - interval '${r.hoursAgo - 1} hours')
           ON CONFLICT (id) DO NOTHING`,
          [ledgerId, orgId, wsProdId, appIdCopilot, r.id, r.model, r.inTokens, r.outTokens, cost.ledgerUsd8],
        );
        const scaled = BigInt(Math.round(Number(cost.budgetUsd6) * 1_000_000));
        totalSettledLedgerScaled += scaled;
      } else if (r.status === 'reserved') {
        const scaled = BigInt(Math.round(Number(cost.budgetUsd6) * 1_000_000));
        totalOutstandingReservedScaled += scaled;
      }
    }

    const totalSpentUsd = ((totalSettledLedgerScaled + totalOutstandingReservedScaled) / 1_000_000n).toString() +
      '.' + ((totalSettledLedgerScaled + totalOutstandingReservedScaled) % 1_000_000n).toString().padStart(6, '0');

    await client.query(
      `INSERT INTO budget_policies (id, organization_id, limit_usd, spent_usd)
       VALUES ('00000000-0000-4000-8000-700000000000', $1, '250.000000', $2)
       ON CONFLICT (organization_id) DO UPDATE SET limit_usd = '250.000000', spent_usd = $2`,
      [orgId, totalSpentUsd],
    );

    // Budget policy para Acme Intelligence
    await client.query(
      `INSERT INTO budget_policies (id, organization_id, limit_usd, spent_usd)
       VALUES ('00000000-0000-4000-8000-700000000099', $1, '50.000000', '0.000000')
       ON CONFLICT (organization_id) DO UPDATE SET limit_usd = '50.000000'`,
      [secondaryOrgId],
    );
    console.log(`  ✓ FinOps: Presupuesto Límite \$250.000000, Gastado \$${totalSpentUsd} (Ledger cuadrado al centésimo).`);

    // Gateway Requests, Traces, Spans, Feedback, Metrics distribuidos en Prod y Staging
    const tracesConfig = [
      // En Producción (Copilot y Finance)
      { i: 1, wsId: wsProdId, appId: appIdCopilot, model: 'gpt-4o-mini', inTok: 850, outTok: 320, lat: 210, st: 'ok', cost: '0.00032000' },
      { i: 2, wsId: wsProdId, appId: appIdCopilot, model: 'gpt-4o-mini', inTok: 1200, outTok: 450, lat: 245, st: 'ok', cost: '0.00045000' },
      { i: 3, wsId: wsProdId, appId: appIdFinance, model: 'claude-3-5-sonnet', inTok: 2500, outTok: 980, lat: 680, st: 'ok', cost: '0.02220000' },
      { i: 4, wsId: wsProdId, appId: appIdFinance, model: 'gpt-4o', inTok: 1800, outTok: 620, lat: 510, st: 'ok', cost: '0.01070000' },
      { i: 5, wsId: wsProdId, appId: appIdCopilot, model: 'qwen2.5:7b', inTok: 3200, outTok: 800, lat: 140, st: 'ok', cost: '0.00000000' },
      { i: 6, wsId: wsProdId, appId: appIdCopilot, model: 'gpt-4o-mini', inTok: 920, outTok: 120, lat: 195, st: 'error', cost: '0.00015000' },
      { i: 7, wsId: wsProdId, appId: appIdCopilot, model: 'gpt-4o-mini', inTok: 1450, outTok: 510, lat: 280, st: 'ok', cost: '0.00052350' },
      { i: 8, wsId: wsProdId, appId: appIdKpi, model: 'deepseek-chat', inTok: 4000, outTok: 1200, lat: 420, st: 'ok', cost: '0.00089600' },
      // En Staging (Support y Contract)
      { i: 9, wsId: wsStagingId, appId: appIdSupport, model: 'llama3.2:3b', inTok: 600, outTok: 180, lat: 95, st: 'ok', cost: '0.00000000' },
      { i: 10, wsId: wsStagingId, appId: appIdSupport, model: 'qwen2.5:7b', inTok: 1100, outTok: 320, lat: 130, st: 'ok', cost: '0.00000000' },
      { i: 11, wsId: wsStagingId, appId: appIdContract, model: 'deepseek-chat', inTok: 3100, outTok: 890, lat: 390, st: 'ok', cost: '0.00068320' },
      { i: 12, wsId: wsStagingId, appId: appIdContract, model: 'gpt-4o-mini', inTok: 1500, outTok: 420, lat: 220, st: 'ok', cost: '0.00047700' },
    ];

    for (const t of tracesConfig) {
      const traceUuid = `00000000-0000-4000-8000-7000000003${t.i.toString().padStart(2, '0')}`;
      const traceHex = sha256(`trace-seed-event-${t.i}`).slice(0, 32);
      const spanRoot = sha256(`span-root-${t.i}`).slice(0, 16);
      const spanRag = sha256(`span-rag-${t.i}`).slice(0, 16);
      const spanLlm = sha256(`span-llm-${t.i}`).slice(0, 16);
      const idemKey = `gw-request-idem-${t.i}`;

      await client.query(
        `INSERT INTO gateway_requests (organization_id, application_id, idempotency_key, model, status, input_tokens, output_tokens, trace_id, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - interval '${t.i * 12} minutes', now() - interval '${t.i * 12 - 1} minutes')
         ON CONFLICT (application_id, idempotency_key) DO NOTHING`,
        [orgId, t.appId, idemKey, t.model, t.st === 'ok' ? 'succeeded' : 'failed', t.inTok, t.outTok, traceHex],
      );

      const exTrace = await client.query('SELECT id FROM traces WHERE id = $1', [traceUuid]);
      let resolvedTraceDbId: string;
      if (exTrace.rows.length > 0) {
        resolvedTraceDbId = exTrace.rows[0].id;
        await client.query(
          `UPDATE traces SET workspace_id = $2, application_id = $3, trace_id = $4, model = $5, status = $6, latency_ms = $7, input_tokens = $8, output_tokens = $9, estimated_cost_usd = $10 WHERE id = $1`,
          [resolvedTraceDbId, t.wsId, t.appId, traceHex, t.model, t.st, t.lat, t.inTok, t.outTok, t.cost],
        );
      } else {
        const insTrace = await client.query(
          `INSERT INTO traces (id, organization_id, workspace_id, application_id, trace_id, model, status, latency_ms, input_tokens, output_tokens, estimated_cost_usd, attributes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{"user_id": "seed-user", "session": "prod-session"}'::jsonb, now() - interval '${t.i * 12} minutes')
           ON CONFLICT (application_id, trace_id) DO UPDATE SET model = $6 RETURNING id`,
          [traceUuid, orgId, t.wsId, t.appId, traceHex, t.model, t.st, t.lat, t.inTok, t.outTok, t.cost],
        );
        resolvedTraceDbId = insTrace.rows[0]?.id ?? traceUuid;
      }

      // Root Span
      await client.query(
        `INSERT INTO trace_spans (trace_id, span_id, parent_span_id, name, duration_ms, attributes)
         VALUES ($1, $2, null, 'gateway.chat_completion', $3, '{"http.status_code": 200}'::jsonb)
         ON CONFLICT (trace_id, span_id) DO NOTHING`,
        [resolvedTraceDbId, spanRoot, t.lat],
      );
      // Child Spans
      await client.query(
        `INSERT INTO trace_spans (trace_id, span_id, parent_span_id, name, duration_ms, attributes)
         VALUES ($1, $2, $3, 'rag.hybrid_retrieval', 35, '{"chunks_fused": 3, "k": 60}'::jsonb)
         ON CONFLICT (trace_id, span_id) DO NOTHING`,
        [resolvedTraceDbId, spanRag, spanRoot],
      );
      await client.query(
        `INSERT INTO trace_spans (trace_id, span_id, parent_span_id, name, duration_ms, attributes)
         VALUES ($1, $2, $3, 'llm.inference', $4, '{"tokens.prompt": 850, "tokens.completion": 320}'::jsonb)
         ON CONFLICT (trace_id, span_id) DO NOTHING`,
        [resolvedTraceDbId, spanLlm, spanRoot, t.lat - 40],
      );

      // Feedback
      const feedbackId = `00000000-0000-4000-8000-7000000004${t.i.toString().padStart(2, '0')}`;
      await client.query(
        `INSERT INTO trace_feedback (id, trace_id, rating, comment)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [feedbackId, resolvedTraceDbId, t.st === 'ok' ? (t.i % 2 === 0 ? 5 : 4) : 1, t.st === 'ok' ? 'Respuesta precisa con citas correctas y baja latencia.' : 'Error 429 proveedor temporal.'],
      );

      // SDK Events
      const sdkEventId = `00000000-0000-4000-8000-7000000005${t.i.toString().padStart(2, '0')}`;
      await client.query(
        `INSERT INTO sdk_events (id, organization_id, application_id, kind, trace_id, attributes)
         VALUES ($1, $2, $3, 'gateway.completion.success', $4, '{"tokens_total": 1170}'::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [sdkEventId, orgId, t.appId, traceHex],
      );

      // Metric samples
      const metricSampleId = `00000000-0000-4000-8000-7000000006${t.i.toString().padStart(2, '0')}`;
      await client.query(
        `INSERT INTO metric_samples (id, organization_id, application_id, name, value, created_at)
         VALUES ($1, $2, $3, 'llm.latency_p95_ms', $4, now() - interval '${t.i * 15} minutes')
         ON CONFLICT (id) DO NOTHING`,
        [metricSampleId, orgId, t.appId, t.lat + 15.5],
      );
    }
    console.log(`  ✓ 12 Trazas con árboles de spans OpenTelemetry, feedback y métricas sembradas.`);

    // -------------------------------------------------------------------------
    // FASE 8: SRE (Alertas, Incidentes), Outbox/Inbox y Auditoría Inmutable
    // -------------------------------------------------------------------------
    console.log('\n[Fase 8/8] Sembrando SRE, Transactional Outbox, Inbox y Auditoría en todos los Workspaces...');

    // Alert rules en Producción y Staging
    const alertRules = [
      { id: '00000000-0000-4000-8000-800000000001', wsId: wsProdId, name: 'Alerta de Latencia Elevada Gateway (>500ms)', metric: 'latency_p95_ms', comp: 'gt', th: 500.0, url: 'https://runbooks.vigilio.io/sre/high-latency' },
      { id: '00000000-0000-4000-8000-800000000002', wsId: wsProdId, name: 'Alerta de Tasa de Fallos (>5%)', metric: 'error_rate', comp: 'gte', th: 0.05, url: 'https://runbooks.vigilio.io/sre/error-rate' },
      { id: '00000000-0000-4000-8000-800000000003', wsId: wsProdId, name: 'Alerta de Presupuesto Consumido (>80%)', metric: 'cost_usd', comp: 'gte', th: 200.0, url: 'https://runbooks.vigilio.io/finops/budget-threshold' },
      { id: '00000000-0000-4000-8000-800000000004', wsId: wsStagingId, name: 'Alerta de Tasa de Fallos Staging (>10%)', metric: 'error_rate', comp: 'gte', th: 0.10, url: 'https://runbooks.vigilio.io/sre/staging-errors' },
    ];

    for (const ar of alertRules) {
      await client.query(
        `INSERT INTO alert_rules (id, organization_id, workspace_id, name, metric, comparator, threshold, runbook_url, enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
         ON CONFLICT (id) DO NOTHING`,
        [ar.id, orgId, ar.wsId, ar.name, ar.metric, ar.comp, ar.th, ar.url, adminId],
      );
    }

    // Alerts
    const alertsData = [
      { id: '00000000-0000-4000-8000-800000000010', wsId: wsProdId, ruleId: alertRules[0].id, sev: 'warning', title: 'Latencia p95 superó umbral temporalmente (540ms)', ack: true },
      { id: '00000000-0000-4000-8000-800000000011', wsId: wsProdId, ruleId: alertRules[1].id, sev: 'critical', title: 'Pico transitorio de errores HTTP 429 en OpenAI Gateway', ack: false },
      { id: '00000000-0000-4000-8000-800000000012', wsId: wsStagingId, ruleId: alertRules[3].id, sev: 'info', title: 'Ejecución de suite de regresión nocturna en Staging', ack: true },
    ];

    for (const a of alertsData) {
      const srcEvent = `00000000-0000-4000-8000-80000000002${a.id.slice(-1)}`;
      await client.query(
        `INSERT INTO alerts (id, source_event_id, organization_id, workspace_id, rule_id, severity, title, acknowledged_by, acknowledged_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET title = $7, severity = $6, acknowledged_by = $8, acknowledged_at = $9`,
        [a.id, srcEvent, orgId, a.wsId, a.ruleId, a.sev, a.title, a.ack ? adminId : null, a.ack ? new Date() : null],
      );
    }

    // Incidents & events
    const incidentsData = [
      {
        id: '00000000-0000-4000-8000-800000000100',
        wsId: wsProdId,
        title: 'Degradación temporal en Gateway Ollama',
        sev: 'sev2',
        status: 'resolved',
        summary: 'Sobrecarga de inferencia en nodo GPU local mitigada mediante balanceo a modelo secundario.',
        events: [
          'Detección automática por Alertmanager OTel Collector',
          'Rutas de modelo actualizadas a cluster redundante. Latencia normalizada.',
        ],
      },
      {
        id: '00000000-0000-4000-8000-800000000101',
        wsId: wsProdId,
        title: 'Pico inusual de concurrencia en Financial RAG',
        sev: 'sev3',
        status: 'resolved',
        summary: 'Consultas paralelas concurrentes atendidas sin pérdida de integridad contable.',
        events: [
          'Incremento de llamadas concurrentes detectado en Valkey rate-limiter',
          'Autoscaling horizontal completado en 45 segundos.',
        ],
      },
      {
        id: '00000000-0000-4000-8000-800000000102',
        wsId: wsStagingId,
        title: 'Falla de validación en benchmark de Staging',
        sev: 'sev3',
        status: 'open',
        summary: 'El evaluador de esquemas regex detectó discrepancias en el nuevo prompt experimental.',
        events: [
          'Notificación enviada al canal de QA Automation',
        ],
      },
    ];

    for (const inc of incidentsData) {
      await client.query(
        `INSERT INTO incidents (id, organization_id, workspace_id, title, severity, status, summary, created_by, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [inc.id, orgId, inc.wsId, inc.title, inc.sev, inc.status, inc.summary, adminId, inc.status === 'resolved' ? new Date() : null],
      );

      for (const msg of inc.events) {
        await client.query(
          `INSERT INTO incident_events (incident_id, message, author_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [inc.id, msg, adminId],
        );
      }
    }

    // Outbox & Processed Events (Inbox)
    const outboxEventId = '00000000-0000-4000-8000-800000000200';
    await client.query(
      `INSERT INTO outbox_events (id, topic, payload, published_at, attempts)
       VALUES ($1, 'vigilio.finops.budget.settled', '{"reservation_id": "00000000-0000-4000-8000-700000000101", "amount": 0.00032}'::jsonb, now(), 1)
       ON CONFLICT (id) DO NOTHING`,
      [outboxEventId],
    );

    await client.query(
      `INSERT INTO processed_events (consumer, event_id)
       VALUES ('finops-ledger-reconciler', $1)
       ON CONFLICT (consumer, event_id) DO NOTHING`,
      [outboxEventId],
    );

    // Audit Events (Inmutables — con protección forbid_audit_mutation())
    const auditActions = [
      { action: 'auth.login_success', type: 'user', resId: adminId, meta: '{"ip": "127.0.0.1", "auth_method": "password+totp"}' },
      { action: 'auth.mfa_enrolled', type: 'user', resId: approverId, meta: '{"factor": "totp", "issuer": "Vigilio Enterprise"}' },
      { action: 'finops.budget_policy_updated', type: 'budget_policy', resId: orgId, meta: '{"limit_usd": "250.000000"}' },
      { action: 'finops.budget_threshold_warned', type: 'budget_policy', resId: orgId, meta: '{"spent_usd": "0.038100", "percent": 0.015}' },
      { action: 'release.promoted_to_production', type: 'release', resId: releasesData[0].id, meta: '{"score": 0.96, "environment": "production"}' },
      { action: 'release.rolled_back', type: 'release', resId: releasesData[2].id, meta: '{"reason": "Superado por v2"}' },
      { action: 'knowledge.document_indexed', type: 'knowledge_document', resId: docsData[0].id, meta: '{"chunks_count": 2, "vector_dim": 64}' },
      { action: 'knowledge.vector_reindexed', type: 'knowledge_base', resId: kbsData[0].id, meta: '{"algorithm": "HNSW", "ef_search": 40}' },
      { action: 'model.provider_registered', type: 'model_provider', resId: providerOpenAiId, meta: '{"provider": "OpenAI Production Gateway"}' },
      { action: 'model.route_updated', type: 'model_route', resId: appIdCopilot, meta: '{"primary": "gpt-4o-mini", "fallback": "claude-3-5-sonnet"}' },
      { action: 'iam.member_invited', type: 'organization_invitation', resId: invitationsData[0].id, meta: '{"invited": "ciso.consultor@example.test", "role": "approver"}' },
      { action: 'privacy.data_export_completed', type: 'data_request', resId: adminId, meta: '{"format": "json_zip", "records": 48}' },
    ];

    for (const a of auditActions) {
      const exists = await client.query(
        `SELECT id FROM audit_events WHERE organization_id = $1 AND action = $2 AND resource_id = $3 LIMIT 1`,
        [orgId, a.action, a.resId],
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO audit_events (organization_id, actor_id, action, resource_type, resource_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [orgId, adminId, a.action, a.type, a.resId, a.meta],
        );
      }
    }
    console.log(`  ✓ 4 Reglas de alerta, 3 alertas, 3 incidentes con timeline y audit_events inmutables sembrados.`);

    // -------------------------------------------------------------------------
    // VERIFICACIÓN FINAL: Recuento de filas por tabla
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('  VERIFICACIÓN COMPLETA DE POBLACIÓN DE TABLAS');
    console.log('================================================================');

    const tableListRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    );

    let populatedCount = 0;
    const emptyTables: string[] = [];

    for (const row of tableListRes.rows) {
      const tName = row.table_name;
      const countRes = await client.query(`SELECT count(*)::int AS cnt FROM "${tName}"`);
      const cnt = countRes.rows[0].cnt;
      if (cnt > 0) {
        populatedCount++;
      } else {
        emptyTables.push(tName);
      }
    }

    console.log(`Tablas Totales en PostgreSQL : ${tableListRes.rows.length}`);
    console.log(`Tablas Pobladas con Éxito    : ${populatedCount} / ${tableListRes.rows.length}`);
    if (emptyTables.length > 0) {
      console.log(`Tablas sin datos (${emptyTables.length}):`, emptyTables);
    } else {
      console.log(`🏆 ¡100% DE LAS TABLAS DEL PROYECTO TIENEN DATOS VÁLIDOS Y COHERENTES!`);
    }

    console.log('================================================================\n');
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('seed-super.ts')) {
  runSuperseed().catch((err) => {
    console.error('Superseed fatal error:', err);
    process.exit(1);
  });
}
