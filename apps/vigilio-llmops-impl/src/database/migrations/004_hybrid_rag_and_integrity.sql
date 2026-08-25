-- Vigilio LLMOps P1/P2: Hybrid RAG (pgvector + FTS + RRF), Document ACLs, Audit Immutability, Release Scoping & Cost Ledger.
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Encrypted optional API key on model_providers (operator URL remains allowlisted)
ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS api_key_ciphertext text;

-- 2. Hybrid RAG: knowledge_bases metadata, knowledge_chunks (HNSW + GIN) & knowledge_document_acl
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT 'builtin-hash-64';
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS embedding_model_digest text NOT NULL DEFAULT 'sha256:vigilio-hash64-v1';

DROP INDEX IF EXISTS knowledge_docs_fts_idx;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  ordinal integer NOT NULL DEFAULT 0,
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_content text NOT NULL,
  content text,
  token_count integer NOT NULL DEFAULT 0,
  embedding_model_digest text NOT NULL DEFAULT 'sha256:vigilio-hash64-v1',
  embedding vector(64) NOT NULL,
  search_vector tsvector NOT NULL,
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS knowledge_chunks_search_vector_gin_idx ON knowledge_chunks USING gin (search_vector);

CREATE TABLE IF NOT EXISTS knowledge_document_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text,
  principal_type text,
  principal_value text,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Evaluation run optional evaluator version binding
ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS evaluator_version_id uuid REFERENCES evaluator_versions(id) ON DELETE SET NULL;

-- 4. Releases: scope active uniqueness per (workspace_id, prompt_id, environment) instead of workspace-global
ALTER TABLE releases ADD COLUMN IF NOT EXISTS prompt_id uuid REFERENCES prompts(id);
ALTER TABLE releases ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('dev', 'staging', 'production'));

UPDATE releases l
SET prompt_id = v.prompt_id
FROM prompt_versions v
WHERE v.id = l.prompt_version_id AND l.prompt_id IS NULL;

DROP INDEX IF EXISTS releases_workspace_one_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS releases_prompt_env_one_active_idx
  ON releases(workspace_id, prompt_id, environment)
  WHERE status = 'active';

-- 5. FinOps authoritative ledger entries & stale reservation sweep index
CREATE TABLE IF NOT EXISTS cost_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES budget_reservations(id) ON DELETE SET NULL,
  model text NOT NULL,
  source text NOT NULL DEFAULT 'gateway',
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  amount_usd numeric(14, 8) NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_ledger_org_created_idx ON cost_ledger_entries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS budget_reservations_status_created_idx ON budget_reservations(status, created_at) WHERE status = 'reserved';

-- 6. Legal consent preservation under GDPR/LFPDPPP account erasure
ALTER TABLE consent_receipts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE consent_receipts DROP CONSTRAINT IF EXISTS consent_receipts_user_id_fkey;
ALTER TABLE consent_receipts ADD CONSTRAINT consent_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE consent_receipts ADD COLUMN IF NOT EXISTS subject_hash text;
ALTER TABLE consent_receipts ADD COLUMN IF NOT EXISTS minimized_at timestamptz;

-- 7. Outbox operational columns for non-blocking claim, retry tracking & dead-lettering
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;
DROP INDEX IF EXISTS outbox_pending_idx;
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events(created_at) WHERE published_at IS NULL AND dead_lettered_at IS NULL;

-- 8. Hot-path composite indexes for traces
CREATE INDEX IF NOT EXISTS traces_workspace_created_idx ON traces(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS traces_app_created_idx ON traces(application_id, created_at DESC);

-- 9. Immutable append-only audit_events trigger
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_immutable_trg ON audit_events;
CREATE TRIGGER audit_events_immutable_trg
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
