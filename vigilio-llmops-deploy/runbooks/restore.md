# Runbook: PostgreSQL 18 + `pgvector` PITR Restore & Disaster Recovery (`pgBackRest`)

## 1. Non-Negotiable Principles
1. **A local Compose volume (`postgres_data`) is NEVER a backup.** Offsite backups reside in an independent S3-compatible bucket encrypted with `aes-256-cbc` (`compose/pgbackrest/pgbackrest.conf`).
2. **Never restore over a live `postgres_data` directory** without Incident Commander sign-off and taking a forensic snapshot of the affected host first.
3. **Weekly Automated Verification:** Existence of S3 objects does not prove recoverability. Run `./scripts/drill-pitr-restore.sh` weekly and after every schema migration to measure actual RTO and RPO.

---

## 2. Routine Disposable PITR Verification Drill (Safe on Staging / Lab)

Executes a zero-impact restore into an ephemeral `--network none` container (`vigilio-pitr-drill-<epoch>`) and cleans up automatically:

```bash
cd vigilio-llmops-deploy
# Optional: specify exact UTC recovery timestamp before logical corruption
export PITR_TARGET_TIME="2026-11-09 06:30:00+00"
./scripts/drill-pitr-restore.sh
cat reports/pitr-restore-evidence.json
```

**Acceptance Criteria (`PASS`):**
- `verification_status == "PASS"`
- `rto_seconds <= 900` (15 minutes)
- `rpo_seconds <= 300` (5 minutes for continuous WAL archiving)
- `integrity_checks.pgvector_extension_present == true`

---

## 3. Full Production Disaster Recovery Procedure (Host Loss or Logical Corruption)

### Step 1 — Provision Clean Hardened Target Host
Run `platform-ops` against the replacement Linux VPS:
```bash
cd platform-ops
ansible-playbook -i inventories/production/hosts.ini playbooks/bootstrap-vps.yml \
  -e vigilio_manage_firewall=true \
  -e pgbackrest_enabled=true \
  -e cosign_verify_enabled=true
```

### Step 2 — Provision Runtime Secrets from Escrow Vault
Restore `compose/.env` (`0600`) and all 12 secret files under `compose/secrets/` (`0600`), including the escrowed `pgbackrest_repo_key` and `pgbackrest_s3_secret`.

### Step 3 — Stop Application Writers Before Restoring Data
Ensure `api`, `worker`, `outbox`, and `postgres` are stopped so zero writes compete with recovery:
```bash
cd vigilio-llmops-deploy/compose
podman compose --env-file .env down
```

### Step 4 — Restore Encrypted Stanza into Clean `postgres_data` Volume
```bash
podman volume rm -f vigilio-llmops_postgres_data || true
podman volume create vigilio-llmops_postgres_data

podman run --rm \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -e PGBACKREST_REPO1_S3_ENDPOINT="${PGBACKREST_REPO1_S3_ENDPOINT}" \
  -e PGBACKREST_REPO1_S3_BUCKET="${PGBACKREST_REPO1_S3_BUCKET}" \
  -e PGBACKREST_REPO1_S3_REGION="${PGBACKREST_REPO1_S3_REGION}" \
  -e PGBACKREST_REPO1_S3_KEY="${PGBACKREST_REPO1_S3_KEY}" \
  -e PGBACKREST_REPO1_CIPHER_PASS="$(cat secrets/pgbackrest_repo_key)" \
  -e PGBACKREST_REPO1_S3_KEY_SECRET="$(cat secrets/pgbackrest_s3_secret)" \
  -v "$PWD/pgbackrest/pgbackrest.conf:/etc/pgbackrest/pgbackrest.conf:ro" \
  -v vigilio-llmops_postgres_data:/var/lib/postgresql \
  "${PGBACKREST_IMAGE}" \
  pgbackrest --stanza=llmops --config=/etc/pgbackrest/pgbackrest.conf \
    --type=time --target="YYYY-MM-DD HH:MM:SS+00" --target-action=promote restore
```
*(Omit `--type=time --target=...` to replay up to the very latest archived WAL segment.)*

### Step 5 — Boot Stateful Plane & Verify Data Integrity
```bash
podman compose --env-file .env up -d postgres valkey nats
podman compose --env-file .env exec postgres psql -U llmops -d llmops -c \
  "SELECT pg_is_in_recovery(), extname FROM pg_extension WHERE extname = 'vector';"
podman compose --env-file .env exec postgres psql -U llmops -d llmops -c \
  "SELECT count(*) AS orgs FROM organizations; SELECT count(*) AS audit_rows FROM audit_events;"
```

### Step 6 — Resume Application Traffic & Record Evidence
```bash
cd ..
./scripts/smoke.sh || true
podman compose -f compose/compose.yaml --env-file compose/.env up -d
./scripts/smoke.sh
./scripts/vigilio-services-check.sh --environment production
```
