# Vigilio LLMOps Deploy — Governance Rules

- Maintain **one** parameterized `compose/compose.yaml` across `prod-local`, `staging`, and `production` (zero forked Compose files).
- Enforce 5 explicit networks (`edge`, `reverse_proxy`, `backend`, `observability`, `egress`); `caddy` MUST NEVER join `backend`.
- Run `migration` and `platform-setup` under `profiles: [tools]` with `restart: "no"` strictly BEFORE rolling `api`, `worker`, and `outbox`.
- Verify `@sha256` immutable digests and `cosign verify` + SLSA provenance attestations on the host BEFORE pulling or migrating.
- Never treat a local VPS volume (`postgres_data`) as a backup; encrypt `pgBackRest` archives (`aes-256-cbc`) to external S3 storage and validate RPO/RTO via `scripts/drill-pitr-restore.sh`.
- Strip cookies, `Authorization`, `X-API-Key`, CSRF tokens, query tokens, and raw LLM prompts/completions in both `edge/Caddyfile` and `observability/otel/collector.yaml`.
