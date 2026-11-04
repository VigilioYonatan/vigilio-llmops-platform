# Runbook: Application, Digest & Prompt Release Rollback

## 1. Two Distinct Rollback Planes

1. **LLM Prompt / Model Configuration Regression (Tenant Plane):**
   - Do **not** redeploy containers for a bad prompt version.
   - Use the governed dual-approval + Step-Up MFA rollback endpoint:
     `POST /api/v1/releases/:releaseId/rollback` (requires recent TOTP verification and `approver`/`admin`/`owner` role).
   - Confirm audit entry `release.rolled_back` in `audit_events`.

2. **Platform Code / Container Regression (Infrastructure Plane):**
   - `scripts/deploy-staging.sh` and `scripts/deploy-production.sh` automatically snapshot `compose/.env` to `compose/.env.previous` before pulling or rolling containers, and automatically revert on health-gate failure.
   - Database migrations follow **Expand / Contract**: `N-1` application containers remain compatible with `N` expanded schema. **Never overwrite a live database with an older backup just to revert stateless application code.**

---

## 2. Manual Container Digest Rollback Procedure

Execute when post-deploy SLO degradation (`VigilioApiHighErrorRate` or `VigilioApiHighLatencyP95`) is detected after the initial health check passed:

### Step 1 — Verify Previous Pinned Environment Snapshot
```bash
cd vigilio-llmops-deploy/compose
ls -la .env .env.previous
diff -u .env.previous .env || true
```

### Step 2 — Re-Verify Cosign Signatures of Previous Digests
```bash
set -a; source .env.previous; set +a
../scripts/verify-image-digests.sh
cosign verify \
  --certificate-oidc-issuer "${COSIGN_CERTIFICATE_OIDC_ISSUER}" \
  --certificate-identity-regexp "${COSIGN_CERTIFICATE_IDENTITY_REGEXP}" \
  "${BACKEND_IMAGE}"
cosign verify \
  --certificate-oidc-issuer "${COSIGN_CERTIFICATE_OIDC_ISSUER}" \
  --certificate-identity-regexp "${COSIGN_CERTIFICATE_IDENTITY_REGEXP}" \
  "${WEB_IMAGE}"
```

### Step 3 — Restore `.env.previous` & Roll Stateless Services Back
```bash
cp -f .env .env.failed-release
chmod 0600 .env.failed-release
cp -f .env.previous .env
chmod 0600 .env

podman compose --env-file .env -f compose.yaml up -d --remove-orphans api worker outbox web caddy
```

### Step 4 — Validate Recovery & Capture Rollback Evidence
```bash
cd ..
SITE_ORIGIN="${SITE_ORIGIN}" ./scripts/smoke.sh
./scripts/vigilio-services-check.sh --environment production --output reports/rollback-evidence.json
rm -f compose/.env.failed-release
```
