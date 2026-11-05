# Tenant isolation
- Register two unrelated accounts and verify them using Mailpit (test only).
- Each creates an organization, workspace, application and trace.
- Request foreign organization/workspace/app/prompt/dataset/eval/trace IDs.
- Assert 403 or 404, never 200 with foreign data.
- Revoke API keys and test ingestion denied.
- Save sanitized HTTP codes, evidence SHA and test DB ID.
