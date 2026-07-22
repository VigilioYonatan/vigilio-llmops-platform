# ADR-003: Hybrid RAG en PostgreSQL (`pgvector` HNSW + FTS + RRF `k=60`), FinOps Transaccional y Máquina de Releases

- **Estado:** Accepted
- **Fecha:** 2026-11-09
- **Decisores:** Vigilio LLMOps Architecture

## Decisión
1. **Hybrid RAG:** Se utiliza PostgreSQL con `pgvector` (`knowledge_chunks.embedding vector(64)`, índice HNSW `vector_cosine_ops`) combinado con búsqueda léxica (`tsv tsvector`, índice GIN) fusionados mediante **Reciprocal Rank Fusion (`RRF`, `k = 60`)**, binding obligatorio de `embedding_model_digest` por base de conocimiento y control de acceso relacional en `knowledge_document_acl`.
2. **FinOps:** `BudgetService` opera exclusivamente con aritmética decimal `numeric(14,6)` en PostgreSQL (`FOR UPDATE`), calcula el costo real de `input_tokens` y `output_tokens` contra `price_cards` (con tarifa base conservadora si no existe card específica), escribe asientos auditables en `cost_ledger_entries` en toda inferencia (`gateway`, `chat/completions`, `evaluations`, `knowledge/answer`) e incluye sweeper de reservas vencidas.
3. **Releases:** La transición `approve` acepta tanto `verified` como `approval_requested`, exige separación de funciones (`created_by != approved_by`) + MFA verificada en los últimos 15 minutos (`step-up` disponible en `/api/v1/me/mfa/step-up`), aisla el release activo por `(workspace_id, prompt_id, environment)` y persiste cada transición en `release_workflow_events`.
