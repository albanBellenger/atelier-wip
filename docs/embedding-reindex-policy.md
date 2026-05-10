# Embedding reindex policy (admin console)

The tool-admin **Embedding reindex policy** row (`embedding_reindex_policy`, singleton `id=1`) controls how background embedding jobs behave in this deployment.

| Field | Meaning |
|-------|---------|
| `auto_reindex_trigger` | When automatic re-indexing runs (e.g. `on_document_change`). Interpreted by ingest routes and [`embedding_pipeline`](../backend/app/services/embedding_pipeline.py). |
| `debounce_seconds` | Minimum delay between document-change events before a re-embed job is scheduled (coalesces rapid edits). |
| `drift_threshold_pct` | Threshold used when comparing freshness/staleness heuristics for admin KPIs and optional stale marking (future pipeline hooks read this via `EmbeddingAdminService`). |
| `retention_days` | How long older embedding snapshots or auxiliary blobs may be retained before purge jobs remove them (policy only until purge jobs are wired). |

**API:** `GET/PATCH /admin/embeddings/reindex-policy` (tool admin). Runtime embedding calls use encrypted keys on [`LlmProviderRegistry`](../backend/app/models/llm_policy.py) plus the **embeddings** routing rule. Embedding model IDs are configured on LLM provider rows (models JSON + LiteLLM slug) and selected via that routing rule—the former `embedding_model_registry` catalog table was removed as unused metadata.
