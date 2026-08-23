import {
  bigint,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const now = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});
const vector64 = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(64)',
  toDriver: (value: number[]) => `[${value.join(',')}]`,
});

export const schema_migrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  applied_at: timestamp('applied_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  display_name: text('display_name').notNull(),
  email_verified: boolean('email_verified').notNull().default(false),
  disabled_at: timestamp('disabled_at', { withTimezone: true }),
  created_at: now(),
});

export const user_credentials = pgTable('user_credentials', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  password_hash: text('password_hash').notNull(),
  created_at: now(),
});

export const user_sessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token_hash: text('token_hash').notNull().unique(),
    csrf_hash: text('csrf_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    mfa_verified_at: timestamp('mfa_verified_at', { withTimezone: true }),
    created_at: now(),
  },
  (t) => [index('user_sessions_user_exp_idx').on(t.user_id, t.expires_at)],
);

export const session_rotation_history = pgTable('session_rotation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  session_id: uuid('session_id')
    .notNull()
    .references(() => user_sessions.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  rotated_at: timestamp('rotated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  replayed_at: timestamp('replayed_at', { withTimezone: true }),
});

export const email_tokens = pgTable('email_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  created_at: now(),
});

export const email_change_tokens = pgTable('email_change_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  next_email: text('next_email').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  created_at: now(),
});

export const social_identities = pgTable(
  'social_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    created_at: now(),
  },
  (t) => [uniqueIndex('social_provider_subject_ux').on(t.provider, t.subject)],
);

export const oauth_transactions = pgTable('oauth_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  state_hash: text('state_hash').notNull().unique(),
  cookie_hash: text('cookie_hash').notNull(),
  return_to: text('return_to').notNull(),
  action: text('action').notNull(),
  initiating_user_id: uuid('initiating_user_id').references(() => users.id),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  created_at: now(),
});

export const mfa_factors = pgTable('mfa_factors', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secret_ciphertext: text('secret_ciphertext').notNull(),
  activated_at: timestamp('activated_at', { withTimezone: true }),
  last_step: bigint('last_step', { mode: 'number' }),
  created_at: now(),
});

export const mfa_recovery_codes = pgTable(
  'mfa_recovery_codes',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code_hash: text('code_hash').notNull().unique(),
    used_at: timestamp('used_at', { withTimezone: true }),
    created_at: now(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.code_hash] })],
);

export const mfa_login_challenges = pgTable('mfa_login_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  challenge_hash: text('challenge_hash').notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  created_at: now(),
});

export const user_onboarding = pgTable('user_onboarding', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  completed_at: timestamp('completed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const consent_receipts = pgTable('consent_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  document_version: text('document_version').notNull(),
  subject_hash: text('subject_hash'),
  minimized_at: timestamp('minimized_at', { withTimezone: true }),
  consented_at: timestamp('consented_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const deletion_requests = pgTable('deletion_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  identity_id: uuid('identity_id').references(() => social_identities.id, {
    onDelete: 'set null',
  }),
  confirmation_hash: text('confirmation_hash').notNull().unique(),
  confirmation_ciphertext: text('confirmation_ciphertext').notNull(),
  request_hash: text('request_hash').notNull().unique(),
  status: text('status').notNull().default('queued'),
  created_at: now(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const memberships = pgTable(
  'memberships',
  {
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    created_at: now(),
  },
  (t) => [primaryKey({ columns: [t.organization_id, t.user_id] })],
);

export const organization_invitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    token_hash: text('token_hash').notNull().unique(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    invited_by: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [index('invitation_org_exp_idx').on(t.organization_id, t.expires_at)],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    created_at: now(),
  },
  (t) => [uniqueIndex('workspaces_org_slug_ux').on(t.organization_id, t.slug)],
);

export const applications = pgTable('applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  environment: text('environment').notNull().default('dev'),
  archived_at: timestamp('archived_at', { withTimezone: true }),
  created_at: now(),
});

export const application_environments = pgTable(
  'application_environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    application_id: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('application_environments_app_name_ux').on(
      t.application_id,
      t.name,
    ),
  ],
);

export const application_keys = pgTable('application_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  application_id: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  scopes: text('scopes').array().notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_at: now(),
});

export const model_providers = pgTable(
  'model_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    base_url: text('base_url').notNull(),
    api_key_ciphertext: text('api_key_ciphertext'),
    enabled: boolean('enabled').notNull().default(true),
    created_by: uuid('created_by').references(() => users.id),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('model_providers_org_name_ux').on(t.organization_id, t.name),
  ],
);

export const model_catalog = pgTable(
  'model_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider_id: uuid('provider_id')
      .notNull()
      .references(() => model_providers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    digest: text('digest').notNull(),
    capabilities: text('capabilities').array().notNull(),
    context_window: integer('context_window').notNull().default(4096),
    active: boolean('active').notNull().default(true),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('model_catalog_provider_name_digest_ux').on(
      t.provider_id,
      t.name,
      t.digest,
    ),
  ],
);

export const model_routes = pgTable(
  'model_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    application_id: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    environment: text('environment').notNull(),
    model_id: uuid('model_id')
      .notNull()
      .references(() => model_catalog.id),
    fallback_model_id: uuid('fallback_model_id').references(
      () => model_catalog.id,
    ),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('model_routes_app_env_ux').on(t.application_id, t.environment),
  ],
);

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    workspace_id: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    application_id: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [uniqueIndex('prompts_workspace_name_ux').on(t.workspace_id, t.name)],
);

export const prompt_versions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    prompt_id: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    template: text('template').notNull(),
    model: text('model').notNull(),
    parameters: jsonb('parameters').notNull().default({}),
    sha256: text('sha256').notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [uniqueIndex('prompt_version_ux').on(t.prompt_id, t.version)],
);

export const prompt_aliases = pgTable(
  'prompt_aliases',
  {
    prompt_id: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    environment: text('environment').notNull(),
    prompt_version_id: uuid('prompt_version_id')
      .notNull()
      .references(() => prompt_versions.id),
    assigned_by: uuid('assigned_by')
      .notNull()
      .references(() => users.id),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.prompt_id, t.environment] })],
);

export const datasets = pgTable('datasets', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  application_id: uuid('application_id').references(() => applications.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const dataset_cases = pgTable('dataset_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  dataset_id: uuid('dataset_id')
    .notNull()
    .references(() => datasets.id, { onDelete: 'cascade' }),
  input: text('input').notNull(),
  expected_output: text('expected_output').notNull(),
  created_at: now(),
});

export const dataset_versions = pgTable(
  'dataset_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dataset_id: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content_digest: text('content_digest').notNull(),
    case_count: integer('case_count').notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('dataset_versions_ds_ver_ux').on(t.dataset_id, t.version),
  ],
);

export const dataset_version_cases = pgTable(
  'dataset_version_cases',
  {
    dataset_version_id: uuid('dataset_version_id')
      .notNull()
      .references(() => dataset_versions.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    case_id: uuid('case_id').notNull(),
    input: text('input').notNull(),
    expected_output: text('expected_output').notNull(),
  },
  (t) => [primaryKey({ columns: [t.dataset_version_id, t.ordinal] })],
);

export const dataset_imports = pgTable('dataset_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  dataset_id: uuid('dataset_id')
    .notNull()
    .references(() => datasets.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('completed'),
  inserted: integer('inserted').notNull().default(0),
  error: text('error'),
  created_at: now(),
});

export const evaluators = pgTable(
  'evaluators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspace_id: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('evaluators_workspace_name_ux').on(t.workspace_id, t.name),
  ],
);

export const evaluator_versions = pgTable(
  'evaluator_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    evaluator_id: uuid('evaluator_id')
      .notNull()
      .references(() => evaluators.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    rubric: jsonb('rubric').notNull().default({}),
    sha256: text('sha256').notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('evaluator_versions_eval_ver_ux').on(t.evaluator_id, t.version),
  ],
);

export const evaluation_runs = pgTable('evaluation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  dataset_id: uuid('dataset_id')
    .notNull()
    .references(() => datasets.id),
  dataset_version_id: uuid('dataset_version_id').references(
    () => dataset_versions.id,
  ),
  prompt_version_id: uuid('prompt_version_id')
    .notNull()
    .references(() => prompt_versions.id),
  evaluator_version_id: uuid('evaluator_version_id').references(
    () => evaluator_versions.id,
    {
      onDelete: 'set null',
    },
  ),
  lease_token: uuid('lease_token'),
  lease_until: timestamp('lease_until', { withTimezone: true }),
  status: text('status').notNull().default('queued'),
  score: numeric('score', { precision: 7, scale: 6 }),
  total_cases: integer('total_cases').notNull().default(0),
  passed_cases: integer('passed_cases').notNull().default(0),
  error: text('error'),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
  finished_at: timestamp('finished_at', { withTimezone: true }),
});

export const evaluation_results = pgTable(
  'evaluation_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    run_id: uuid('run_id')
      .notNull()
      .references(() => evaluation_runs.id, { onDelete: 'cascade' }),
    case_id: uuid('case_id')
      .notNull()
      .references(() => dataset_cases.id),
    passed: boolean('passed').notNull(),
    actual_output: text('actual_output').notNull(),
    notes: text('notes'),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('evaluation_results_run_case_ux').on(t.run_id, t.case_id),
  ],
);

export const evaluation_comparisons = pgTable('evaluation_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  baseline_run_id: uuid('baseline_run_id')
    .notNull()
    .references(() => evaluation_runs.id),
  candidate_run_id: uuid('candidate_run_id')
    .notNull()
    .references(() => evaluation_runs.id),
  baseline_score: numeric('baseline_score', { precision: 7, scale: 6 }),
  candidate_score: numeric('candidate_score', { precision: 7, scale: 6 }),
  score_delta: numeric('score_delta', { precision: 8, scale: 6 }),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const evaluation_annotations = pgTable(
  'evaluation_annotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    run_id: uuid('run_id')
      .notNull()
      .references(() => evaluation_runs.id, { onDelete: 'cascade' }),
    case_id: uuid('case_id')
      .notNull()
      .references(() => dataset_cases.id),
    score: boolean('score').notNull(),
    notes: text('notes').notNull(),
    author_id: uuid('author_id')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [index('eval_annotations_run_idx').on(t.run_id)],
);

export const quality_policies = pgTable('quality_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  minimum_score: numeric('minimum_score', { precision: 7, scale: 6 }).notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const quality_policy_versions = pgTable(
  'quality_policy_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policy_id: uuid('policy_id')
      .notNull()
      .references(() => quality_policies.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    minimum_score: numeric('minimum_score', {
      precision: 7,
      scale: 6,
    }).notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [uniqueIndex('quality_policy_versions_ux').on(t.policy_id, t.version)],
);

export const releases = pgTable('releases', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  prompt_id: uuid('prompt_id').references(() => prompts.id),
  environment: text('environment').notNull().default('production'),
  prompt_version_id: uuid('prompt_version_id')
    .notNull()
    .references(() => prompt_versions.id),
  evaluation_run_id: uuid('evaluation_run_id')
    .notNull()
    .references(() => evaluation_runs.id),
  policy_id: uuid('policy_id')
    .notNull()
    .references(() => quality_policies.id),
  status: text('status').notNull().default('draft'),
  policy_threshold_snapshot: numeric('policy_threshold_snapshot', {
    precision: 7,
    scale: 6,
  }).notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  approved_by: uuid('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  created_at: now(),
});

export const release_workflow_events = pgTable('release_workflow_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  release_id: uuid('release_id')
    .notNull()
    .references(() => releases.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  actor_id: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  detail: jsonb('detail').notNull().default({}),
  created_at: now(),
});

export const traces = pgTable(
  'traces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    workspace_id: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    application_id: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    trace_id: text('trace_id').notNull(),
    model: text('model').notNull(),
    status: text('status').notNull(),
    latency_ms: integer('latency_ms').notNull(),
    input_tokens: integer('input_tokens').notNull().default(0),
    output_tokens: integer('output_tokens').notNull().default(0),
    estimated_cost_usd: numeric('estimated_cost_usd', {
      precision: 14,
      scale: 8,
    })
      .notNull()
      .default('0'),
    attributes: jsonb('attributes').notNull().default({}),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('traces_app_trace_id_ux').on(t.application_id, t.trace_id),
    index('traces_org_created_idx').on(t.organization_id, t.created_at),
    index('traces_workspace_created_idx').on(t.workspace_id, t.created_at),
    index('traces_app_created_idx').on(t.application_id, t.created_at),
  ],
);

export const trace_feedback = pgTable('trace_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  trace_id: uuid('trace_id')
    .notNull()
    .references(() => traces.id, { onDelete: 'cascade' }),
  rating: smallint('rating').notNull(),
  comment: text('comment'),
  created_at: now(),
});

export const trace_spans = pgTable(
  'trace_spans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trace_id: uuid('trace_id')
      .notNull()
      .references(() => traces.id, { onDelete: 'cascade' }),
    span_id: text('span_id').notNull(),
    parent_span_id: text('parent_span_id'),
    name: text('name').notNull(),
    duration_ms: integer('duration_ms').notNull(),
    attributes: jsonb('attributes').notNull().default({}),
    created_at: now(),
  },
  (t) => [uniqueIndex('trace_spans_trace_span_ux').on(t.trace_id, t.span_id)],
);

export const sdk_events = pgTable(
  'sdk_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    application_id: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    trace_id: text('trace_id'),
    attributes: jsonb('attributes').notNull().default({}),
    created_at: now(),
  },
  (t) => [
    index('sdk_events_app_created_idx').on(t.application_id, t.created_at),
  ],
);

export const metric_samples = pgTable(
  'metric_samples',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    application_id: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    value: doublePrecision('value').notNull(),
    created_at: now(),
  },
  (t) => [index('metric_samples_app_idx').on(t.application_id, t.created_at)],
);

export const gateway_requests = pgTable(
  'gateway_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    application_id: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    idempotency_key: text('idempotency_key').notNull(),
    model: text('model').notNull(),
    status: text('status').notNull(),
    input_tokens: integer('input_tokens'),
    output_tokens: integer('output_tokens'),
    trace_id: text('trace_id'),
    created_at: now(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('gateway_requests_app_idem_ux').on(
      t.application_id,
      t.idempotency_key,
    ),
  ],
);

export const budget_policies = pgTable(
  'budget_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    limit_usd: numeric('limit_usd', { precision: 14, scale: 6 }).notNull(),
    spent_usd: numeric('spent_usd', { precision: 14, scale: 6 })
      .notNull()
      .default('0'),
    created_at: now(),
  },
  (t) => [uniqueIndex('budget_org_unique').on(t.organization_id)],
);

export const budget_reservations = pgTable(
  'budget_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    idempotency_key: text('idempotency_key').notNull(),
    estimated_usd: numeric('estimated_usd', {
      precision: 14,
      scale: 6,
    }).notNull(),
    status: text('status').notNull().default('reserved'),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('budget_reservation_org_key').on(
      t.organization_id,
      t.idempotency_key,
    ),
  ],
);

export const price_cards = pgTable(
  'price_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    price_input_per_million: numeric('price_input_per_million', {
      precision: 14,
      scale: 8,
    }).notNull(),
    price_output_per_million: numeric('price_output_per_million', {
      precision: 14,
      scale: 8,
    }).notNull(),
    effective_from: timestamp('effective_from', { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: now(),
  },
  (t) => [
    index('price_cards_lookup_idx').on(
      t.organization_id,
      t.model,
      t.effective_from,
    ),
  ],
);

export const cost_ledger_entries = pgTable(
  'cost_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspace_id: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    application_id: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    reservation_id: uuid('reservation_id').references(
      () => budget_reservations.id,
      {
        onDelete: 'set null',
      },
    ),
    model: text('model').notNull(),
    source: text('source').notNull().default('gateway'),
    input_tokens: integer('input_tokens').notNull().default(0),
    output_tokens: integer('output_tokens').notNull().default(0),
    amount_usd: numeric('amount_usd', { precision: 14, scale: 8 })
      .notNull()
      .default('0'),
    created_at: now(),
  },
  (t) => [
    index('cost_ledger_org_created_idx').on(t.organization_id, t.created_at),
  ],
);

export const knowledge_bases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  embedding_model: text('embedding_model').notNull().default('builtin-hash-64'),
  embedding_model_digest: text('embedding_model_digest')
    .notNull()
    .default('sha256:vigilio-hash64-v1'),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const knowledge_documents = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledge_base_id: uuid('knowledge_base_id')
    .notNull()
    .references(() => knowledge_bases.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  visibility: text('visibility').notNull().default('workspace'),
  search_vector: tsvector('search_vector'),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const knowledge_chunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    document_id: uuid('document_id')
      .notNull()
      .references(() => knowledge_documents.id, { onDelete: 'cascade' }),
    knowledge_base_id: uuid('knowledge_base_id')
      .notNull()
      .references(() => knowledge_bases.id, { onDelete: 'cascade' }),
    chunk_index: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    token_count: integer('token_count').notNull().default(0),
    embedding_model_digest: text('embedding_model_digest')
      .notNull()
      .default('sha256:vigilio-hash64-v1'),
    embedding: vector64('embedding').notNull(),
    tsv: tsvector('tsv').notNull(),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('knowledge_chunks_doc_idx_ux').on(t.document_id, t.chunk_index),
    index('knowledge_chunks_kb_idx').on(t.knowledge_base_id),
  ],
);

export const knowledge_document_acl = pgTable(
  'knowledge_document_acl',
  {
    document_id: uuid('document_id')
      .notNull()
      .references(() => knowledge_documents.id, { onDelete: 'cascade' }),
    principal_type: text('principal_type').notNull(),
    principal_value: text('principal_value').notNull(),
    granted_by: uuid('granted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    created_at: now(),
  },
  (t) => [
    primaryKey({
      columns: [t.document_id, t.principal_type, t.principal_value],
    }),
  ],
);

export const knowledge_jobs = pgTable('knowledge_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledge_base_id: uuid('knowledge_base_id')
    .notNull()
    .references(() => knowledge_bases.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  created_at: now(),
});

export const alert_rules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  metric: text('metric').notNull(),
  comparator: text('comparator').notNull(),
  threshold: numeric('threshold', { precision: 14, scale: 6 }).notNull(),
  runbook_url: text('runbook_url').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source_event_id: uuid('source_event_id'),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspace_id: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    rule_id: uuid('rule_id').references(() => alert_rules.id, {
      onDelete: 'set null',
    }),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    acknowledged_by: uuid('acknowledged_by').references(() => users.id),
    acknowledged_at: timestamp('acknowledged_at', { withTimezone: true }),
    created_at: now(),
  },
  (t) => [
    uniqueIndex('alerts_event_dedupe_idx').on(t.rule_id, t.source_event_id),
  ],
);

export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  status: text('status').notNull().default('open'),
  summary: text('summary'),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  created_at: now(),
});

export const incident_events = pgTable('incident_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  incident_id: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  author_id: uuid('author_id')
    .notNull()
    .references(() => users.id),
  created_at: now(),
});

export const data_requests = pgTable('data_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('requires_review'),
  reason: text('reason'),
  created_at: now(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export const outbox_events = pgTable('outbox_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  published_at: timestamp('published_at', { withTimezone: true }),
  locked_at: timestamp('locked_at', { withTimezone: true }),
  last_error: text('last_error'),
  dead_lettered_at: timestamp('dead_lettered_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  created_at: now(),
});

export const processed_events = pgTable(
  'processed_events',
  {
    consumer: text('consumer').notNull(),
    event_id: uuid('event_id').notNull(),
    created_at: now(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.event_id] })],
);

export const audit_events = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organization_id: uuid('organization_id'),
    actor_id: uuid('actor_id'),
    action: text('action').notNull(),
    resource_type: text('resource_type').notNull(),
    resource_id: text('resource_id').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    created_at: now(),
  },
  (t) => [index('audit_org_created_idx').on(t.organization_id, t.created_at)],
);
