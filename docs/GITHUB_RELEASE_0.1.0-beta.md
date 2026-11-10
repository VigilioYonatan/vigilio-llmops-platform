# GitHub Release v0.1.0-beta

## Repository About Description (148 chars)
> Self-hosted enterprise LLMOps platform: NestJS 11, Preact 11, pgvector + FTS RRF k=60, micro-cent FinOps, Quality Gates, OpenTelemetry & rootless Podman.

---

## Release Title
**Vigilio LLMOps Platform v0.1.0-beta — Enterprise Self-Hosted AI Governance & Operations**

---

## Release Body

We are proud to announce the **v0.1.0-beta** milestone of the **Vigilio LLMOps Platform**, a sovereign, self-hosted operational system designed for enterprise teams deploying large language models with strict governance, zero vendor lock-in, and micro-cent FinOps precision.

### 🌟 Key Highlights

- **Hexagonal Architecture Backend (NestJS 11 + Drizzle ORM):**
  - Pragmatic Domain-Driven Design with transactional boundaries.
  - PostgreSQL 16 with `pgvector` dense vector embeddings and Valkey in-memory locking.
  - Real-time event streaming powered by NATS JetStream.
- **Reactive SPA Console (Preact 11 + Signals):**
  - Ultra-lightweight reactive UI with instant Theme Concurrency (Dark & Light Mode).
  - TanStack Query v5 cache synchronization and Zod Spanish locale form validations.
  - Modular consoles for Prompt Engineering, Playground, Evaluations, Releases, Knowledge RAG, FinOps, Traces, and IAM.
- **Micro-Cent FinOps & Real-Time Hard Limits:**
  - ACID transactional ledger preventing runaway API expenses.
  - Row-level `SELECT ... FOR UPDATE` hard-budget locking eliminates TOCTOU race conditions.
  - Multi-tier warning thresholds (80% warn, 100% hard cutoff).
- **Hybrid RAG (Reciprocal Rank Fusion `k=60`):**
  - Dense cosine similarity (`pgvector`) fused with lexical full-text search (`ts_rank_cd`).
  - Document-level Access Control Lists (ACL) and verifiable source citations.
- **Quality Gates & Release Governance:**
  - Automated benchmark evaluations with assertion criteria.
  - 4-Eyes cryptographic sign-off and instant one-click rollbacks.
- **SRE & Production Hardening:**
  - Rootless Podman / Docker Compose deployment with Caddy edge proxy.
  - OpenTelemetry distributed tracing and metrics export.
  - Container signature validation via `cosign verify`.
  - Zero downtime point-in-time recovery via pgBackRest.

### 📦 Verification & Test Matrix

- **E2E Playwright Automation:** 66/66 PostgreSQL tables validated under real user click journeys.
- **OpenAPI Reference:** Interactive Scalar documentation available at `/reference`.
- **Cosign Signature:** Images cryptographically signed with KMS keys.

### 🚀 Getting Started

```bash
git clone https://github.com/VigilioYonatan/vigilio-llmops-platform.git
cd vigilio-llmops-platform
docker compose -f vigilio-llmops-deploy/compose/compose.yaml up -d
```

---
*Authored by Yonatan Vigilio (`yonatanvigiliolavado@gmail.com`)*
