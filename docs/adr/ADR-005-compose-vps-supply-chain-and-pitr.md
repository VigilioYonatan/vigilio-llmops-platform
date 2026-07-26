# ADR-005: Entrega Compose-VPS Segmentada, Supply Chain Firmada (SBOM + Cosign) y Respaldo PITR (`pgBackRest`)

- **Estado:** Accepted
- **Fecha:** 2026-11-09
- **Decisores:** Vigilio LLMOps Architecture

## Decisión
1. **Segmentación de Red Compose:** Se separan 4 redes (`edge` pública solo en Caddy, `reverse_proxy` interna entre Caddy y `api`/`web`/`grafana`, `backend` interna para PostgreSQL/Valkey/NATS inaccesibles desde Caddy, y `egress` para salida controlada HTTPS/SMTP de `api`, `worker`, `otel-collector` y `pgbackrest`).
2. **Hardening de Contenedores:** Imágenes non-root (`10001`), `read_only: true` con `tmpfs` explícitos (`/tmp`, `/config`, `/data` en `web`), `cap_drop: [ALL]`, `no-new-privileges:true`, límites `cpus`, `mem_limit` y `pids_limit` en todos los servicios, y autenticación obligatoria en PostgreSQL, Valkey y NATS.
3. **Supply Chain y Promoción:** CI construye imágenes OCI sin secretos, genera SBOM CycloneDX/SPDX (`Syft`), escanea vulnerabilidades (`Trivy`) y secretos (`Gitleaks`), firma por digest inmutable (`Cosign`) y el host VPS verifica `cosign verify` antes de ejecutar migraciones separadas y rollout con rollback automático.
4. **Continuidad Operativa (PITR):** Un volumen local nunca se considera backup. `pgBackRest` archiva WAL y backups cifrados hacia almacenamiento externo S3-compatible fuera del VPS con simulacro automatizado `drill-pitr-restore.sh` midiendo RPO y RTO reales.
