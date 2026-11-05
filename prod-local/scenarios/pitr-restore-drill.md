# Scenario: Disposable `pgBackRest` PITR Restore Rehearsal (`prod-local`)

Validates end-to-end backup encryption, WAL replay, `pgvector` extension integrity, and measured RTO/RPO against a local S3-compatible test target (e.g., MinIO / RustFS on an independent network) **without touching the live `postgres_data` volume**.

## Guardrails
- Never point `PGBACKREST_REPO1_S3_ENDPOINT` in `prod-local` at the production S3 bucket.
- `drill-pitr-restore.sh` boots its recovery container with `--network none` so zero outbound webhooks, emails, or OAuth calls can fire from restored rows.

## Execution Steps

1. **Provision S3 test bucket & stanza:**
   Configure test S3 endpoint/bucket in `../vigilio-llmops-deploy/compose/.env` and populate `secrets/pgbackrest_repo_key` + `secrets/pgbackrest_s3_secret`.

2. **Create stanza & take encrypted full backup + WAL archive:**
   ```bash
   cd ../vigilio-llmops-deploy/compose
   podman compose --env-file .env --profile backup run --rm pgbackrest \
     pgbackrest --stanza=llmops --config=/etc/pgbackrest/pgbackrest.conf stanza-create
   podman compose --env-file .env --profile backup run --rm pgbackrest \
     pgbackrest --stanza=llmops --config=/etc/pgbackrest/pgbackrest.conf --type=full backup
   ```

3. **Record timestamp `T1`, insert a synthetic marker organization, then record `T2`:**
   - Capture UTC timestamp `T1` (`date -u '+%Y-%m-%d %H:%M:%S+00'`).
   - Simulate an unwanted post-`T1` change in lab DB.

4. **Execute automated disposable PITR drill targeting `T1`:**
   ```bash
   cd ../vigilio-llmops-deploy
   PITR_TARGET_TIME="${T1}" ./scripts/drill-pitr-restore.sh
   cat reports/pitr-restore-evidence.json
   ```

5. **Verify JSON Evidence (`reports/pitr-restore-evidence.json`):**
   - `verification_status == "PASS"`
   - `integrity_checks.network_isolated == true`
   - `integrity_checks.pgvector_extension_present == true`
   - `rto_seconds` and `rpo_seconds` recorded numerically (`<= 900s` RTO, `<= 300s` RPO).
