# ADR-002: Arquitectura Hexagonal Pragmática, Ownership Único por Agregado y Puertos Drizzle

- **Estado:** Accepted
- **Fecha:** 2026-11-09
- **Decisores:** Vigilio LLMOps Architecture

## Contexto
La iteración inicial fragmentó el backend en 24 carpetas con colisión sobre las mismas tablas y acopló servicios de aplicación directamente a SQL crudo y objetos Express `Request`/`Response`.

## Decisión
1. Se consolidan los dominios en **módulos agregados cohesivos con un solo propietario por tabla y prefijo REST** (`identity`, `organizations`, `applications`, `model-catalog`, `prompts`, `datasets`, `evaluations`, `releases`, `gateway`, `knowledge`, `telemetry`, `finops`, `operations`, `governance`, `system`).
2. Dirección estricta de dependencias verificada por `scripts/check-boundaries.mjs`:
   - `presentation/http/{controllers,dto,doc}` → `application` → `application/ports` + `domain`
   - `infrastructure/persistence/drizzle` implementa `application/ports` y nunca es importada por `presentation` ni `domain`.
3. `src/database/schema.ts` (Drizzle) refleja el 100 % de tablas, claves primarias, llaves foráneas e índices de `src/database/migrations/001..004.sql`.
4. Un único artefacto OCI backend ejecuta los 5 roles de proceso (`api`, `worker`, `outbox`, `migration`, `platform-setup`) cerrando limpiamente el SDK de OpenTelemetry en todos ellos.
