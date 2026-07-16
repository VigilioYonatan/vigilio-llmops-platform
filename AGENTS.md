# Vigilio LLMOps Platform — Workspace Checkout Governance

Este directorio coordina las cinco unidades de repositorio independientes de la plataforma Vigilio LLMOps B2B self-hosted, sin `package.json` ni carpeta manual `contracts/` en la raíz:

1. `apps/vigilio-llmops-impl` — Backend único de negocio en NestJS 11 / TypeScript, Arquitectura Hexagonal + DDD pragmático, PostgreSQL + `pgvector` + Drizzle ORM, Valkey, NATS JetStream, OpenTelemetry, FinOps transaccional, Hybrid RAG (RRF `k=60`) y emisor autoritativo de `openapi/openapi.json` + paquete versionado `@vigilio/llmops-contracts`.
2. `apps/vigilio-llmops-web` — Consola web SPA en Preact 11 + Signals + TanStack Query + React Hook Form + Zod (`es`), servida estáticamente por Caddy sin mezclar runtimes con NestJS.
3. `vigilio-llmops-deploy` — Único dueño de `compose/compose.yaml`, `edge/Caddyfile`, observabilidad (OTel Collector, Prometheus, Alertmanager, Loki, Tempo, Grafana), respaldos `pgBackRest` PITR, scripts de despliegue con `cosign verify` y runbooks SRE.
4. `platform-ops` — Automatización Ansible reusable e idempotente para baseline de host VPS, hardening SSH/UFW, rootless Podman, `cosign_verify` y `pgbackrest_host` validada con Molecule.
5. `prod-local` — Laboratorio local de validación operativa que reutiliza `vigilio-llmops-deploy/compose/compose.yaml` sin forkear topología.

## Reglas Innegociables
- Prohibido crear `package.json` o `contracts/` manuales en la raíz del workspace.
- Precedencia: Contratos/ADRs aprobados (`docs/adr/`) > Skills y normas canónicas Vigilio > Documentación de librerías por versión.
- Ningún gate se declara `PASS` sin ejecución real de comandos y artefactos verificables (`PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`).
