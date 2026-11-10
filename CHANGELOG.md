# Changelog

All notable changes to the **Vigilio LLMOps Platform** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-beta] - 2026-11-10

### Added
- **Hexagonal Architecture Backend (`apps/vigilio-llmops-impl`):**
  - NestJS 11 core structured with pragmatic Domain-Driven Design (DDD).
  - PostgreSQL 16 persistence with `pgvector` dense embeddings and Drizzle ORM.
  - In-memory caching and lock synchronization via Valkey (Redis-compatible).
  - Event-driven orchestration with NATS JetStream pub/sub.
  - OpenTelemetry native distributed tracing with span waterfalls and latency percentiles.
- **Reactive Web Console (`apps/vigilio-llmops-web`):**
  - High-performance Preact 11 Single Page Application with `@preact/signals`.
  - Accessible theme toggler supporting instant Dark Mode and Light Mode switching (`data-theme`).
  - TanStack Query v5 cache management with optimistic updates.
  - Strict form validation in Spanish via Zod locale.
  - Modular features: Dashboard Overview, Prompt Studio, Playground, Datasets, Evaluations, Quality Gates, Releases, FinOps Budgets, Knowledge Bases, Traces, IAM & Audit.
- **FinOps Micro-Cent Transactional Ledger:**
  - Real-time hard-budget enforcement with `SELECT ... FOR UPDATE` row locks to prevent TOCTOU race conditions.
  - Multi-tier warning and cutoff thresholds (e.g. 80% warn, 100% hard limit).
  - Exact token and USD calculation per model provider.
- **Hybrid RAG Knowledge Engine:**
  - Reciprocal Rank Fusion (`RRF k=60`) combining semantic cosine similarity (`pgvector`) and lexical search (`ts_rank_cd`).
  - Document-level Access Control Lists (ACL) with workspace and restricted scopes.
  - Verified citation generation linking generated answers directly to source chunks.
- **Quality Gates & Governance Lifecycle:**
  - Semantic prompt versioning with Jinja/Handlebars template variables and diff comparison.
  - Evaluation benchmark suites with deterministic scoring (exact match, cosine similarity, assertion checks).
  - Cryptographic release evidence bundles and 4-Eyes sign-off policies.
  - Automated canary rollout progression and one-click rollback.
- **Enterprise Infrastructure & SRE (`vigilio-llmops-deploy` & `platform-ops`):**
  - Multi-service Docker Compose topology (`compose/compose.yaml`) with Caddy reverse proxy.
  - Automated host provisioning with Ansible roles (SSH/UFW hardening, rootless Podman, pgBackRest PITR).
  - Container signature verification using `cosign verify`.
  - Scalar interactive OpenAPI 3.1 documentation exposed at `/reference`.
- **Comprehensive E2E Test Suite & Deterministic Super Seeder:**
  - 66/66 database tables populated with enterprise personas, models, traces, and metrics.
  - End-to-end Playwright tests verifying entire user journeys against real PostgreSQL state.
