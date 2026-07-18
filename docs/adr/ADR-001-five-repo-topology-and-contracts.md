# ADR-001: Topología de Cinco Repositorios y Gobernanza de Contratos sin Carpeta Manual Compartida

- **Estado:** Accepted
- **Fecha:** 2026-11-09
- **Decisores:** Vigilio LLMOps Architecture

## Contexto
La plataforma requiere separación estricta entre el runtime backend (`vigilio-llmops-impl`), la SPA web (`vigilio-llmops-web`), la topología de entrega Compose/SRE (`vigilio-llmops-deploy`), la automatización de host (`platform-ops`) y el laboratorio de simulación (`prod-local`).

## Decisión
1. Se mantienen 5 repositorios Git independientes coordinados bajo un directorio `workspace-checkout/` que **no contiene `package.json` ni carpeta manual `contracts/`**.
2. `vigilio-llmops-impl` es el único propietario de los esquemas HTTP y eventos. Genera `openapi/openapi.json` determinista a partir de sus DTOs Zod v4 (`z.toJSONSchema`) y empaqueta un artefacto cliente npm browser-safe versionado (`@vigilio/llmops-contracts-1.0.0.tgz`) con integridad SHA-512 fijada en `apps/vigilio-llmops-web/pnpm-lock.yaml`.
3. Solo `vigilio-llmops-deploy` posee `compose/compose.yaml`; `prod-local` lo invoca mediante `-f ../vigilio-llmops-deploy/compose/compose.yaml`.
4. Se documenta la fijación del toolchain productivo probado (`pnpm 10.19+/12`, `Node 24 LTS`, `NestJS 11.1`, `Preact 11.0`, `Zod 4.1`, `PostgreSQL 18 + pgvector 0.8.7`, `Valkey 9.0`, `NATS 2.10/2.12`) garantizando reproducibilidad con `--frozen-lockfile`.

## Consecuencias
- Cero deriva manual entre DTOs de servidor y proyecciones de navegador.
- Builds OCI 100 % autónomos por repositorio.
