# Vigilio LLMOps Deploy — Single-Source Compose-VPS, Observability & DR

Authoritative runtime repository for `vigilio-llmops-platform` (Level 1 Cloud-Neutral `compose-vps`). Owns the single parameterized `compose/compose.yaml`, `edge/Caddyfile`, co-versioned observability stack (`observability/`), `pgBackRest` offsite encrypted PITR configuration, supply-chain gated deployment scripts, and SRE runbooks.

## Network Segmentation (Zero Implicit Bridges)

1. `edge` (`internal: false`): Public ingress (`80/tcp`, `443/tcp`, `443/udp` HTTP/3) attached **exclusively** to `caddy`.
2. `reverse_proxy` (`internal: true`): Isolated L7 proxy segment shared **only** between `caddy`, `web`, `api`, and `grafana`. `caddy` has zero route to `backend`!
3. `backend` (`internal: true`): Authenticated data & messaging plane (`postgres` `pgvector:0.8.7-pg18`, `valkey`, `nats`, `api`, `worker`, `outbox`, `migration`, `platform-setup`, `pgbackrest`). Zero host ports published.
4. `observability` (`internal: true`): Telemetry & alerting plane (`otel-collector`, `alloy`, `tempo`, `loki`, `prometheus`, `alertmanager`, `grafana`, `api`, `worker`, `outbox`).
5. `egress` (`internal: false`): Controlled outbound HTTPS/SMTP/OAuth/LLM/S3 channel for `api`, `worker`, `otel-collector`, `alertmanager`, and `pgbackrest`.

## Canonical Operational Workflow

```bash
# 1. Static preflight & digest verification
./scripts/preflight.sh

# 2. Supply-chain gated deployment (Cosign verify -> isolated migration -> rollout -> auto-rollback)
./scripts/deploy-staging.sh

# 3. Promote identical verified digests to production
PROMOTED_FROM_STAGING_SHA="<40-hex-sha>" CHANGE_APPROVAL_REF="CHG-2026-001" ./scripts/deploy-production.sh

# 4. Emit sanitized operational evidence & rehearse disposable PITR restore
./scripts/vigilio-services-check.sh --environment production
./scripts/drill-pitr-restore.sh
```
