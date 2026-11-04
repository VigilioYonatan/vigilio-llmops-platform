# Runbook: Production Incident Response — Vigilio LLMOps Platform

## 1. Severity Matrix & Response SLAs

| Severity | Trigger / Alert | Initial Ack | Mitigation Target | Escalation |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1** | `VigilioApiDown`, `VigilioPostgresDown`, credential leak, cross-tenant IDOR indicator | <= 5 min | <= 30 min | Incident Commander + Security Lead |
| **SEV-2** | `VigilioApiHighErrorRate` (>2%), `VigilioDlqMessagesDetected`, `VigilioOutboxBacklogCritical`, `VigilioBackupStale` | <= 15 min | <= 60 min | Primary On-Call SRE + Backend Owner |
| **SEV-3** | `VigilioApiHighLatencyP95`, `VigilioFinOpsBudgetExhaustionWarning`, `VigilioOutboxBacklogHigh` | <= 30 min | <= 4 hours | Primary On-Call SRE |

---

## 2. Triage & Sanitized Evidence Collection (First 5 Minutes)

> **STRICT PRIVACY RULE:** Never paste raw LLM prompts, completions, `Authorization` headers, cookies, or `compose/secrets/*` contents into incident channels or tickets.

1. **Generate immediate platform health & digest snapshot:**
   ```bash
   cd vigilio-llmops-deploy
   ./scripts/vigilio-services-check.sh --environment production --output reports/incident-triage.json
   cat reports/incident-triage.json
   ```
2. **Inspect container health and recent logs:**
   ```bash
   cd compose
   podman compose --env-file .env ps
   podman compose --env-file .env logs --tail=100 api worker outbox caddy otel-collector
   ```
3. **Correlate Trace IDs in Grafana (`/ops/grafana` via Bastion CIDR):**
   - Open dashboard **`Vigilio LLMOps — Operational & FinOps Overview`**.
   - Pivot from Prometheus exemplars or Loki `trace_id` derived fields directly into Tempo spans.

---

## 3. Playbook By Alert Class

### A. `VigilioApiHighErrorRate` / Post-Deploy Regression
1. Check if incident started within 30 minutes of a release deployment (`ls -la compose/.env.previous`).
2. Execute immediate signed-digest rollback per [`runbooks/rollback.md`](./rollback.md).

### B. `VigilioFinOpsBudgetExhausted`
1. Determine whether exhaustion is legitimate tenant usage or a runaway client retry loop via Grafana FinOps panel (`organization_id`, `workspace_id`).
2. If an application API key is compromised or looping, revoke the application key from the Workspace Console (`POST /api/v1/applications/:id/keys/:keyId/revoke`).
3. Verify stale budget reservations are cleared by the transactional FinOps sweeper (`vigilio_finops_active_reservations_usd`).

### C. `VigilioOutboxBacklogCritical` / `VigilioDlqMessagesDetected`
1. Verify `nats` and `worker` health:
   ```bash
   podman compose --env-file .env ps nats outbox worker
   ```
2. Inspect unpublished outbox rows and failure count (read-only SQL):
   ```bash
   podman compose --env-file .env exec postgres psql -U llmops -d llmops -c \
     "SELECT topic, attempts, count(*) FROM outbox_events WHERE published_at IS NULL GROUP BY 1, 2;"
   ```
3. If external SMTP or webhook endpoint is degraded, fix egress connectivity (`egress` network / `SMTP_HOST`) and restart `worker` (`podman compose --env-file .env restart worker`).

### D. Suspected Credential Compromise or Meta Data-Deletion Anomaly
1. Rotate affected credentials immediately using [`runbooks/secret-rotation.md`](./secret-rotation.md).
2. Verify `audit_events` immutability trigger remains intact and export audit trail for Security review.

---

## 4. Closure & Post-Mortem Requirements
1. Confirm all Prometheus alerts return to `inactive` for >= 15 minutes.
2. Run `./scripts/smoke.sh` and `./scripts/vigilio-services-check.sh --environment production`.
3. File blameless post-mortem within 48 hours including root cause, detection latency, and an automated regression test or OPA/Alert rule preventing recurrence.
