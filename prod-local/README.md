# prod-local — Single-Topology Local Validation Laboratory

Operational validation laboratory for the Vigilio LLMOps Platform. Consumes `../vigilio-llmops-deploy/compose/compose.yaml` and `../vigilio-llmops-deploy/edge/Caddyfile` directly — zero forked Compose manifests.

## Commands

```bash
# 1. Verify anti-fork topology invariants & Compose config interpolation
./scripts/check-lab.sh

# 2. Boot isolated local lab stack (requires test-only secrets & images)
ALLOW_TEST_DATA_RESET=yes ./scripts/run-lab.sh

# 3. Execute HTTP health, edge 403 block, CSP header & operational evidence checks
SITE_ORIGIN=http://localhost ./scripts/run-smoke.sh
```

## Rehearsal Scenarios
- [`scenarios/smoke-and-rollback.md`](./scenarios/smoke-and-rollback.md) — Edge hardening, smoke checks, automatic container digest rollback, and dual-approval prompt release rollback.
- [`scenarios/pitr-restore-drill.md`](./scenarios/pitr-restore-drill.md) — Disposable `--network none` PostgreSQL 18 + `pgvector` PITR restore verification measuring RTO and RPO.
- [`scenarios/tenant-isolation.md`](./scenarios/tenant-isolation.md) — Cross-tenant IDOR (`403`/`404`) and API key revocation rehearsal.
- [`scenarios/disaster-recovery.md`](./scenarios/disaster-recovery.md) — Offsite backup gate acceptance summary.
