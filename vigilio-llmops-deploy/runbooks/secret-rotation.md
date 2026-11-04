# Runbook: Secret & Cryptographic Key Rotation (`compose/secrets/`)

All secrets reside outside Git in `compose/secrets/*` with `0600` permissions on the VPS host. Never commit temporary or rotated secret files.

---

## 1. Rotation Cadence & Scope

| Secret | Max TTL / Cadence | Impact of Rotation |
| :--- | :--- | :--- |
| `metrics_token` | 90 days | Zero user impact (reload Prometheus + rolling restart `api`) |
| `grafana_password` | 90 days | Operator admin credential update |
| `smtp_password` | 90 days | Restart `worker`, `api`, `alertmanager` |
| `facebook_app_secret` | On Meta rotation / incident | Brief OAuth callback window during `api` restart |
| `session_secret` | 180 days or incident | Invalidates active browser sessions (users re-authenticate + MFA) |
| `valkey_password` | 90 days | Brief rate-limiter / ephemeral cache reset during `valkey` + `api` restart |
| `nats_token` | 90 days | Brief async pause while `nats`, `outbox`, `worker`, `api` restart (Outbox guarantees zero event loss!) |
| `postgres_password` + `database_url` | 90 days | Coordinated `ALTER ROLE` + secret update + backend restart |
| `encryption_key_b64` | 365 days or incident | Envelope keyring re-encryption of stored provider keys (`v1:`) |
| `pgbackrest_s3_secret` | 90 days | Update IAM/S3 secret + restart `pgbackrest` + run `pgbackrest check` |

---

## 2. Step-by-Step Rotation Procedures

### A. `metrics_token` (Prometheus <-> API)
```bash
cd vigilio-llmops-deploy/compose
openssl rand -hex 32 | tr -d '\n' > secrets/metrics_token.new
chmod 0600 secrets/metrics_token.new
mv -f secrets/metrics_token.new secrets/metrics_token
podman compose --env-file .env up -d --force-recreate api prometheus
```

### B. `postgres_password` and `database_url`
1. Generate new password and apply inside PostgreSQL first:
   ```bash
   cd vigilio-llmops-deploy/compose
   NEW_PG_PASS="$(openssl rand -hex 32)"
   podman compose --env-file .env exec postgres psql -U llmops -d llmops -c \
     "ALTER ROLE llmops WITH PASSWORD '${NEW_PG_PASS}';"
   ```
2. Atomically replace `secrets/postgres_password` and `secrets/database_url`:
   ```bash
   printf '%s' "${NEW_PG_PASS}" > secrets/postgres_password.new
   printf 'postgresql://llmops:%s@postgres:5432/llmops' "${NEW_PG_PASS}" > secrets/database_url.new
   chmod 0600 secrets/postgres_password.new secrets/database_url.new
   mv -f secrets/postgres_password.new secrets/postgres_password
   mv -f secrets/database_url.new secrets/database_url
   unset NEW_PG_PASS
   ```
3. Recreate consumers and verify readiness:
   ```bash
   podman compose --env-file .env up -d --force-recreate postgres api worker outbox
   ../scripts/smoke.sh
   ```

### C. `valkey_password` and `nats_token`
Because transactional events are persisted in PostgreSQL `outbox_events` before publishing to NATS, rotating `nats_token` loses zero events:
```bash
cd vigilio-llmops-deploy/compose
openssl rand -hex 32 | tr -d '\n' > secrets/valkey_password.new
openssl rand -hex 32 | tr -d '\n' > secrets/nats_token.new
chmod 0600 secrets/valkey_password.new secrets/nats_token.new
mv -f secrets/valkey_password.new secrets/valkey_password
mv -f secrets/nats_token.new secrets/nats_token
# If VALKEY_URL / NATS_URL in .env embed credentials, update .env (0600) in lockstep
podman compose --env-file .env up -d --force-recreate valkey nats api outbox worker
../scripts/smoke.sh
```

### D. `pgbackrest_s3_secret` & `pgbackrest_repo_key`
1. **S3 Access Secret (`pgbackrest_s3_secret`):** Issue a new S3 key pair on the offsite storage provider, update `PGBACKREST_REPO1_S3_KEY` in `.env` and `secrets/pgbackrest_s3_secret` (`0600`), recreate `pgbackrest`, run `pgbackrest --stanza=llmops check`, and only then revoke the old S3 key.
2. **Cipher Key (`pgbackrest_repo_key`):** `pgBackRest` encrypts an entire stanza repository with a single cipher key. Rotating `pgbackrest_repo_key` requires initializing a fresh offsite bucket/path (`stanza-create` + immediate `backup --type=full`), escrowing the new key in the corporate vault, and retaining the old bucket until its retention window expires.

---

## 3. Post-Rotation Verification
Always finish secret rotation by recording clean operational evidence:
```bash
cd vigilio-llmops-deploy
./scripts/smoke.sh
./scripts/vigilio-services-check.sh --environment production
```
