# Admin console — Phase 3 specification (deferred)

This document captures **Phase 3** items from the admin console plan that are **not** implemented in the current codebase slice. They remain design targets for a follow-up milestone.

## Multi-provider credential registry

Today, [`LlmProviderRegistry`](../backend/app/models/llm_policy.py) already stores **encrypted credentials per provider**. Phase 3 extends this with optional **per deployment region** rows when multiple upstream accounts must be active simultaneously under finer grouping. Admin routes would expose masked previews only; writes would re-encrypt server-side.

## Per-builder budgets and alert tiers

Phase 2 delivers **studio-level** monthly caps (`studios.budget_cap_monthly_usd`) and enforcement hooks in [`LLMService`](../backend/app/services/llm_service.py) via [`LlmPolicyService.assert_studio_budget`](../backend/app/services/llm_policy_service.py). Phase 3 extends this with **per-user caps**, configurable alert thresholds (e.g. 75/90/100%), and notification channels — requiring persisted rules and possibly notification dispatch integration.

## Extended audit export

[`deployment_activity`](../backend/app/models/deployment_activity.py) supports pagination via [`GET /admin/activity`](../backend/app/routers/admin.py). Phase 3 may add CSV export, retention windows, and optional streaming replication for compliance tooling.

All runtime inference remains behind **`LLMService`** and **`EmbeddingService`** per project rules.
