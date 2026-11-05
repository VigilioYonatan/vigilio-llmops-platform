# Scenario: Local Production Smoke, Security Gate & Automatic Digest Rollback

Rehearses the exact promotion and rollback mechanics of `vigilio-llmops-deploy` on a local developer/SRE machine without forking `compose.yaml`.

## Prerequisites
1. Local OCI images built from `apps/vigilio-llmops-impl` and `apps/vigilio-llmops-web` and pinned by digest in `../vigilio-llmops-deploy/compose/.env`.
2. All 12 test-only secret files generated in `../vigilio-llmops-deploy/compose/secrets/` (`0600`).

## Step 1 — Validate Anti-Fork & Topology Invariants
```bash
cd prod-local
./scripts/check-lab.sh
```

## Step 2 — Boot Full Stack & Run Smoke Verification
```bash
ALLOW_TEST_DATA_RESET=yes ./scripts/run-lab.sh
SITE_ORIGIN=http://localhost ./scripts/run-smoke.sh
```
**Expected Verdicts:**
- `GET /health/live` -> `200 OK`
- `GET /health/ready` -> `200 OK`
- `GET /metrics` -> `403 Forbidden` (blocked at Caddy edge)
- `GET /api/docs` -> `403 Forbidden` (blocked at Caddy edge)
- `GET /` -> `200 OK` with `Content-Security-Policy` containing `img-src 'self' data: https:; frame-ancestors 'none'; form-action 'self'`

## Step 3 — Rehearse Automatic Container Digest Rollback
1. Ensure `../vigilio-llmops-deploy/compose/.env.previous` holds the working `BACKEND_IMAGE` digest.
2. Inject a broken/unhealthy `BACKEND_IMAGE` digest into `.env` and run `deploy-staging.sh` with `DEPLOY_HEALTH_TIMEOUT_SECONDS=15`.
3. Confirm the `ERR` trap in `deploy-staging.sh` automatically restores `.env.previous`, recreates `api`, `worker`, `outbox`, `web`, and `caddy`, and restores `GET /health/ready` -> `200 OK`.

## Step 4 — Rehearse Governed Prompt Release Rollback (Application Plane)
1. Authenticate User A (`admin`) -> create prompt version `v2` and release candidate.
2. Authenticate User B (`approver` != User A) -> complete Step-Up TOTP MFA -> approve & activate release.
3. Trigger `POST /api/v1/releases/:id/rollback` with fresh MFA -> assert active release reverts to `v1` and `audit_events` records `release.rolled_back`.
