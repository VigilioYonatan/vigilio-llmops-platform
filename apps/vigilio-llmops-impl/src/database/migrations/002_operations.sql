-- Forward-only migration: all resources are tenant-owned, no provider tokens logged or returned.
CREATE TABLE IF NOT EXISTS model_providers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('ollama','openai-compatible')),
 base_url text NOT NULL,enabled boolean NOT NULL DEFAULT true,created_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS model_catalog(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 provider_id uuid NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
 name text NOT NULL,digest text NOT NULL,capabilities text[] NOT NULL DEFAULT ARRAY['chat']::text[],
 context_window integer NOT NULL DEFAULT 4096 CHECK(context_window BETWEEN 128 AND 1048576),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider_id,name,digest));
CREATE TABLE IF NOT EXISTS model_routes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('dev','staging','production')),
 model_id uuid NOT NULL REFERENCES model_catalog(id),fallback_model_id uuid REFERENCES model_catalog(id),
 updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(application_id,environment));
CREATE TABLE IF NOT EXISTS prompt_aliases(
 prompt_id uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('dev','staging','production')),
 prompt_version_id uuid NOT NULL REFERENCES prompt_versions(id),
 assigned_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(prompt_id,environment));
CREATE TABLE IF NOT EXISTS dataset_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>=1),content_digest text NOT NULL,case_count integer NOT NULL CHECK(case_count>=0),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(dataset_id,version));
CREATE TABLE IF NOT EXISTS dataset_version_cases(
 dataset_version_id uuid NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal>=0),case_id uuid NOT NULL, input text NOT NULL, expected_output text NOT NULL,
 PRIMARY KEY(dataset_version_id,ordinal));
CREATE TABLE IF NOT EXISTS dataset_imports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','failed')),
 inserted integer NOT NULL DEFAULT 0,error text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS evaluators(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('exact_match','contains','regex')),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,name));
CREATE TABLE IF NOT EXISTS evaluator_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evaluator_id uuid NOT NULL REFERENCES evaluators(id) ON DELETE CASCADE,
 version integer NOT NULL,rubric jsonb NOT NULL DEFAULT '{}'::jsonb,sha256 text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(evaluator_id,version));
CREATE TABLE IF NOT EXISTS evaluation_comparisons(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 baseline_run_id uuid NOT NULL REFERENCES evaluation_runs(id),candidate_run_id uuid NOT NULL REFERENCES evaluation_runs(id),
 baseline_score numeric(7,6),candidate_score numeric(7,6),score_delta numeric(8,6),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(baseline_run_id<>candidate_run_id));
CREATE TABLE IF NOT EXISTS evaluation_annotations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
 case_id uuid NOT NULL REFERENCES dataset_cases(id),score boolean NOT NULL,notes text NOT NULL,
 author_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS eval_annotations_run_idx ON evaluation_annotations(run_id);
CREATE TABLE IF NOT EXISTS trace_feedback(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trace_id uuid NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),comment text,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS trace_spans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trace_id uuid NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
 span_id text NOT NULL,parent_span_id text,name text NOT NULL,duration_ms integer NOT NULL CHECK(duration_ms>=0),
 attributes jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(trace_id,span_id));
CREATE TABLE IF NOT EXISTS price_cards(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 model text NOT NULL,price_input_per_million numeric(14,8) NOT NULL CHECK(price_input_per_million>=0),
 price_output_per_million numeric(14,8) NOT NULL CHECK(price_output_per_million>=0),
 effective_from timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS price_cards_lookup_idx ON price_cards(organization_id,model,effective_from DESC);
CREATE TABLE IF NOT EXISTS alert_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL,metric text NOT NULL CHECK(metric IN ('error_rate','latency_p95_ms','cost_usd')),
 comparator text NOT NULL CHECK(comparator IN ('gt','gte')),
 threshold numeric(14,6) NOT NULL CHECK(threshold>=0),
 runbook_url text NOT NULL,enabled boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS alerts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL,severity text NOT NULL CHECK(severity IN ('info','warning','critical')),
 title text NOT NULL,acknowledged_by uuid REFERENCES users(id),acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS incidents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 title text NOT NULL,severity text NOT NULL CHECK(severity IN ('sev1','sev2','sev3')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 summary text,created_by uuid NOT NULL REFERENCES users(id),resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS incident_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
 message text NOT NULL,author_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS data_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('export','delete')),
 status text NOT NULL DEFAULT 'requires_review' CHECK(status IN ('queued','requires_review','completed','rejected')),
 reason text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE TABLE IF NOT EXISTS organization_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 email text NOT NULL,role text NOT NULL CHECK(role IN ('admin','developer','approver','analyst','viewer')),
 token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,accepted_at timestamptz,revoked_at timestamptz,
 invited_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS invitation_org_exp_idx ON organization_invitations(organization_id,expires_at);
CREATE TABLE IF NOT EXISTS knowledge_bases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS knowledge_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
 title text NOT NULL,content text NOT NULL,visibility text NOT NULL DEFAULT 'workspace' CHECK(visibility IN ('workspace','restricted')),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS knowledge_docs_fts_idx ON knowledge_documents USING GIN(to_tsvector('simple',content));
CREATE TABLE IF NOT EXISTS knowledge_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('completed','failed')),created_at timestamptz NOT NULL DEFAULT now());
-- Bind prompts/datasets to applications when created through app-scoped API; historical workspace-wide records stay supported.
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES applications(id) ON DELETE SET NULL;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES applications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS prompts_app_idx ON prompts(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS datasets_app_idx ON datasets(application_id) WHERE application_id IS NOT NULL;
-- Alert event id permits retries without duplicate alert notifications.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source_event_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS alerts_event_dedupe_idx ON alerts(rule_id,source_event_id);
-- Explicit cancellation state; worker must not change a cancelled run back to a completed one.
ALTER TABLE evaluation_runs DROP CONSTRAINT IF EXISTS evaluation_runs_status_check;
ALTER TABLE evaluation_runs ADD CONSTRAINT evaluation_runs_status_check CHECK(status IN ('queued','running','passed','failed','error','cancelled'));
ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS lease_until timestamptz;
CREATE TABLE IF NOT EXISTS quality_policy_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),policy_id uuid NOT NULL REFERENCES quality_policies(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>=1),minimum_score numeric(7,6) NOT NULL CHECK(minimum_score BETWEEN 0 AND 1),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(policy_id,version));
ALTER TABLE releases ADD COLUMN IF NOT EXISTS policy_threshold_snapshot numeric(7,6);
UPDATE releases l SET policy_threshold_snapshot=q.minimum_score FROM quality_policies q WHERE l.policy_id=q.id AND l.policy_threshold_snapshot IS NULL;
ALTER TABLE releases ALTER COLUMN policy_threshold_snapshot SET NOT NULL;
ALTER TABLE releases DROP CONSTRAINT IF EXISTS releases_status_check;
ALTER TABLE releases ADD CONSTRAINT releases_status_check CHECK(status IN ('draft','verified','approval_requested','approved','active','rolled_back','rejected'));
CREATE TABLE IF NOT EXISTS release_workflow_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
 action text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS session_rotation_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,
 rotated_at timestamptz NOT NULL DEFAULT now(),replayed_at timestamptz);
CREATE TABLE IF NOT EXISTS mfa_login_challenges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 challenge_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS email_change_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 next_email text NOT NULL,token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,
 consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_onboarding(
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,completed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS application_environments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(name IN ('dev','staging','production')),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(application_id,name));
CREATE TABLE IF NOT EXISTS sdk_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 kind text NOT NULL,trace_id text,attributes jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sdk_events_app_created_idx ON sdk_events(application_id,created_at DESC);
CREATE TABLE IF NOT EXISTS metric_samples(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 name text NOT NULL,value double precision NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS metric_samples_app_idx ON metric_samples(application_id,created_at DESC);
CREATE TABLE IF NOT EXISTS gateway_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,model text NOT NULL,status text NOT NULL CHECK(status IN ('pending','succeeded','failed')),
 input_tokens integer,output_tokens integer,trace_id text,created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,UNIQUE(application_id,idempotency_key));
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE knowledge_documents SET search_vector=to_tsvector('simple',content) WHERE search_vector IS NULL;
CREATE INDEX IF NOT EXISTS knowledge_docs_search_vector_idx ON knowledge_documents USING GIN(search_vector);
