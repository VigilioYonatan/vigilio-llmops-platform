# External Secret Material (`compose/secrets/`) — NEVER Committed to Git

All runtime credentials are mounted read-only at `/run/secrets/<name>` inside authorized containers only.
Before starting Compose, create owner-only files (`chmod 0700 compose/secrets && chmod 0600 compose/secrets/*`) for every secret listed below:

| Secret File | Consumers | Purpose & Format | Generation Example |
| :--- | :--- | :--- | :--- |
| `postgres_password` | `postgres`, `pgbackrest` | Superuser/role password for PostgreSQL 18 (`llmops`) | `openssl rand -base64 36 \| tr -d '\n' > compose/secrets/postgres_password` |
| `database_url` | `api`, `worker`, `outbox`, `migration`, `platform-setup` | Full DSN (`postgresql://llmops:<url-encoded-pass>@postgres:5432/llmops`) | Match `postgres_password` (`chmod 0600`) |
| `valkey_password` | `valkey`, `api`, `worker`, `outbox`, `migration`, `platform-setup` | Valkey `--requirepass` authentication credential | `openssl rand -hex 32 \| tr -d '\n' > compose/secrets/valkey_password` |
| `nats_token` | `nats`, `api`, `worker`, `outbox`, `migration`, `platform-setup` | NATS JetStream `--auth` shared authentication token | `openssl rand -hex 32 \| tr -d '\n' > compose/secrets/nats_token` |
| `session_secret` | `api`, `worker`, `outbox`, `migration`, `platform-setup` | High-entropy HMAC/cookie session signing key (>= 32 bytes) | `openssl rand -base64 48 \| tr -d '\n' > compose/secrets/session_secret` |
| `encryption_key_b64` | `api`, `worker`, `outbox`, `migration`, `platform-setup` | 32 random bytes Base64-encoded for AES-256-GCM envelope encryption (`v1:`) | `openssl rand -base64 32 \| tr -d '\n' > compose/secrets/encryption_key_b64` |
| `facebook_app_secret` | `api`, `worker`, `outbox`, `migration`, `platform-setup` | Meta OAuth & `signed_request` HMAC-SHA256 secret (use placeholder if disabled) | Meta App Dashboard secret or `disabled-placeholder` in local dev |
| `smtp_password` | `api`, `worker`, `outbox`, `migration`, `platform-setup`, `alertmanager` | Transactional & alert email relay password | Provider SMTP credential (`dummy-local` for Mailpit in dev lab) |
| `grafana_password` | `grafana` | Initial Grafana administrator password (`GF_SECURITY_ADMIN_PASSWORD__FILE`) | `openssl rand -base64 32 \| tr -d '\n' > compose/secrets/grafana_password` |
| `metrics_token` | `api`, `worker`, `outbox`, `migration`, `platform-setup`, `prometheus` | Bearer token (>= 24 chars) protecting `/metrics` scrape between Prometheus and API | `openssl rand -hex 32 \| tr -d '\n' > compose/secrets/metrics_token` |
| `pgbackrest_repo_key` | `pgbackrest` | AES-256-CBC repository encryption passphrase (`repo1-cipher-pass`) | `openssl rand -base64 48 \| tr -d '\n' > compose/secrets/pgbackrest_repo_key` |
| `pgbackrest_s3_secret` | `pgbackrest` | Write-append/restore secret access key for external offsite S3 backup bucket | Offsite S3 IAM/service key (`chmod 0600`) |

## Non-Negotiable Security Controls
1. **Zero Git / Zero OCI Layer Leakage:** Never commit secret files, `.env`, `.env.previous`, or backup artifacts. Gitleaks enforces this in CI.
2. **Strict File Permissions:** `scripts/preflight.sh` verifies `0600` mode on `.env` and secret files on Linux hosts before running `compose up`.
3. **Separate Backup Fault Domain:** Keep a sealed offline/escrow copy of `pgbackrest_repo_key` in the organization password vault; without it, AES-256 encrypted S3 backups cannot be decrypted if the primary VPS is lost.
4. **Rotation:** Follow [`runbooks/secret-rotation.md`](../../runbooks/secret-rotation.md) for zero/minimal-downtime dual-key and Rolling Restart procedures.
