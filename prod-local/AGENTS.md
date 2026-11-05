# prod-local — Local Production Rehearsal Governance

- **Single Source of Topology:** Strictly reuse `../vigilio-llmops-deploy/compose/compose.yaml` and `../vigilio-llmops-deploy/edge/Caddyfile`. Creating any local `compose.yaml` or `docker-compose.yml` inside `prod-local/` is forbidden and blocked by `scripts/check-lab.sh`.
- **Test-Only Data Isolation:** Never point `prod-local` at production databases, live S3 backup buckets, or real customer SMTP/OAuth endpoints.
- **Honest Operational Evidence:** Emit `PASS`, `FAIL`, `NOT_RUN`, or `BLOCKED` based solely on real command executions (`../vigilio-llmops-deploy/scripts/vigilio-services-check.sh`).
