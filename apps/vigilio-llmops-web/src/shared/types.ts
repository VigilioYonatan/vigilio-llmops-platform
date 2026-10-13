/** UI projections only. Wire DTOs are owned by NestJS; replace these projections with generated OpenAPI client types before contract gate. */
export type User = {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
};
export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: string;
};
export type Workspace = {
  id: string;
  organization_id?: string;
  name: string;
  slug: string;
};
export type Model = {
  id: string;
  name: string;
  provider?: string;
  enabled?: boolean;
  context_window?: number;
};
export type Application = {
  id: string;
  name: string;
  workspace_id?: string;
  environment: string;
  created_at?: string;
};
export type Prompt = {
  id: string;
  name: string;
  description?: string;
  latest_version?: number;
  created_at?: string;
};
export type PromptVersion = {
  id: string;
  version: number;
  model: string;
  template?: string;
  sha256?: string;
};
export type Dataset = { id: string; name: string; case_count?: number };
export type DatasetCase = {
  id: string;
  input: string;
  expected_output: string;
};
export type Evaluation = {
  id: string;
  status: string;
  score: string | null;
  total_cases: number;
  passed_cases: number;
  created_at: string;
};
export type Release = {
  id: string;
  status: string;
  created_by?: string;
  prompt_version_id?: string;
  created_at?: string;
};
export type Trace = {
  id: string;
  trace_id: string;
  model: string;
  status: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string;
  created_at: string;
};
export type Stats = {
  requests: number;
  avg_latency_ms: number;
  errors: number;
  estimated_cost_usd: string;
};
