# RBAC — personas and module access

This document is the **source of truth** for human-role access to Atelier modules. It is derived from FastAPI dependencies in [`backend/app/deps.py`](../backend/app/deps.py), router `Depends(...)` chains, and selected service-layer checks. The SPA loads effective capability flags from [`GET /studios/{studio_id}/me/capabilities`](../backend/app/routers/studios.py) via [`frontend/src/hooks/useStudioAccess.ts`](../frontend/src/hooks/useStudioAccess.ts) (React Query); without a studio id in scope, the hook falls back to client-side derivation from [`GET /auth/me`](../backend/app/routers/auth.py) for navigation shells only.

**Related tests:** [`backend/tests/integration/test_studio_capabilities.py`](../backend/tests/integration/test_studio_capabilities.py) (capabilities endpoint) and [`backend/tests/integration/test_cross_studio_access.py`](../backend/tests/integration/test_cross_studio_access.py) (cross-studio grants); see also [`rbac_matrix_smoke_wip.py`](../backend/tests/integration/rbac_matrix_smoke_wip.py) for broader matrix coverage.

---

## Personas (product language → implementation)

| Persona | Implementation |
|--------|------------------|
| **Platform admin** | `users.is_platform_admin` |
| **Studio owner** | `studio_members.role = studio_admin` (studio creator becomes admin; multiple admins allowed) |
| **Builder** | `studio_members.role = studio_member` |
| **External** | Approved `cross_studio_access` with `access_level = external_editor` (user is from a *requesting* studio, not the software owner studio) |
| **Viewer** | **Home viewer:** `studio_members.role = studio_viewer`. **Cross-studio viewer:** approved grant with `access_level = viewer`. |

Legend in tables: **Y** = allowed, **N** = forbidden (typical 403), **—** = not applicable / blocked earlier (e.g. no route access). **Y\*** = allowed with constraints (filtering, field-level checks, or empty result).

---

## Module matrix (CRUD + key actions)

Rows are **product modules**. Columns are personas. **R** = read/list/get, **C** = create, **U** = update/patch/put, **D** = delete. Extra columns note actions that are not plain CRUD.

### 1. Platform admin — infrastructure only (`/admin/*`)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R (embedding config, LLM registry & routing, connectivity tests, admin console overview, studio directory read-only, per-studio LLM policy & GitLab **read**) | Y | N | N | N | N | N |
| C/U (registry rows, routing rules, embedding models & reindex policy, per-studio LLM policy via admin studio routes) | Y | N | N | N | N | N |
| C `POST /admin/studios` (bootstrap / support) | Y | Y | Y | Y | Y | Y |

**Not** platform-admin scope: cross-studio approval (studio owners), all-studio token usage, user provisioning, per-studio budget caps, GitLab writes for studios (owners use software/studio routes).

*Enforced by:* `require_platform_admin` on [`backend/app/routers/admin.py`](../backend/app/routers/admin.py).

---

### 2. Studios (metadata)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R `GET /studios`, `GET /studios/{id}` | Y | Y | Y | Y† | Y | N‡ |
| C `POST /studios` | Y | Y | Y | Y | Y | Y |
| U `PATCH /studios/{id}` | Y | Y | N | N | N | N |
| D `DELETE /studios/{id}` | Y | Y | N | N | N | N |

† External is not a member of owner studio; they do not use `GET /studios/{owner}` for granted software (they use software/project routes). ‡ Cross-studio viewer has no enrollment on unrelated studios.

*Enforced by:* `get_studio_access` vs `require_studio_admin` on [`studios.py`](../backend/app/routers/studios.py).

---

### 3. Invites and roles

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R `GET .../members` | Y | Y | Y | N | Y | N |
| C/U/D invite, role, remove | Y | Y | N | N | N | N |

---

### 4. Cross-studio request (requesting studio)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| C `POST .../cross-studio-request` | Y | Y | N | N | N | N |

*Enforced by:* `require_studio_admin` (requesting studio’s admin).

---

### 4b. Cross-studio approval (target software’s studio)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R `GET .../cross-studio-incoming`, `GET .../cross-studio-outgoing` | N | Y | N | N | N | N |
| U `PUT .../cross-studio-incoming/{grant_id}` (approve / reject / revoke) | N | Y (owner of studio that owns target software) | N | N | N | N |

*Enforced by:* `ensure_studio_owner_membership` + target-software ownership checks in [`CrossStudioService`](../backend/app/services/cross_studio_service.py).

---

### 5. Studio token usage & MCP keys (studio UI)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R `GET .../token-usage` (studio scope) | Y | Y | N | N | N | N |
| R/U `.../mcp-keys` | Y | Y | N | N | N | N |

---

### 6. Software (under owner studio)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R list / get / `history` | Y | Y | Y | Y† | Y | Y† |
| C `POST .../software` | Y | Y | N | N | N | N |
| U `PUT/PATCH` (name, description only) | Y | Y | Y | Y† | N | N |
| U `PUT/PATCH` (**definition**, **git** fields) | Y | Y | N | N | N | N |
| D delete software | Y | Y | N | N | N | N |
| Git test `POST .../git/test` | Y | Y | N | N | N | N |

† External / cross-studio: only for software they can resolve via [`resolve_studio_access_for_software`](../backend/app/deps.py); list filtered for cross-studio viewer. Definition/git updates require **Studio Owner** (service check on `_SOFTWARE_ADMIN_FIELDS` in [`software_service.py`](../backend/app/services/software_service.py)) even when the route allows editors.

---

### 7. Projects (`/software/{id}/projects/...`)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R list / get project | Y | Y | Y | Y | Y | Y |
| C create project | Y | Y | Y | N | N | N |
| U / D project | Y | Y | N | N | N | N |

*C* requires `require_software_home_editor` (no cross-studio). *U/D* require `require_project_studio_admin_nested` (Studio Owner on owning enrollment).

---

### 8. Sections & outline

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R list / get section, context-preview | Y | Y | Y | Y | Y | Y |
| C section / reorder / D section | Y | Y | N | N | N | N |
| U `PATCH` section (content) | Y | Y | Y | Y | N | N |
| U `PATCH` section (**structure** fields) | Y | Y | N | N | N | N |
| Improve `POST .../improve` | Y | Y | Y | Y | N | N |

*Outline ops* (create, reorder, delete): `require_outline_manager` — Studio Owner only, **not** cross-studio ([`deps.py`](../backend/app/deps.py)). Content patch: `require_project_member` + `SectionService` structure keys require Owner.

---

### 9. Collab (Yjs WebSocket)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| WS connect | Y | Y | Y | Y | N | N |

*Enforced by:* `is_studio_editor` in [`collab.py`](../backend/app/routers/collab.py).

---

### 10. Work orders

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R list / detail | Y | Y | Y | Y | Y | Y |
| C/U/D / generate / notes / deps / dismiss-stale | Y | Y | Y | Y | N | N |

*Mutations:* `require_project_member`.

---

### 11. Private thread (section copilot)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R / stream / reset | Y | Y | Y | Y | N | N |

All routes: `require_project_member`.

---

### 12. Artifacts

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R list / download / detail metadata | Y | Y | Y | Y | Y | Y |
| C upload / create | Y | Y | Y | Y | N | N |
| D delete (all scopes: project, studio library, software library) | Y | Y | N | N | N | N |
| Re-index (`POST …/reindex`) | Y | Y | Y | Y | N | N |

*Delete* requires **Studio Owner** on the owning studio (`require_project_studio_admin` on `/projects/{project_id}/artifacts/...`, or equivalent checks on `DELETE /artifacts/{id}`). *Re-index* requires **Studio Owner or Builder** on the owning studio (same visibility as upload; not Studio Viewers).

*Enforced by:* [`deps.py`](../backend/app/deps.py) (`ensure_user_can_download_artifact`, `ensure_user_can_delete_artifact`, `ensure_user_can_reindex_artifact`) and artifact routers in [`artifacts.py`](../backend/app/routers/artifacts.py), [`artifacts_by_id.py`](../backend/app/routers/artifacts_by_id.py). Chunking strategy updates use the same studio-admin check as delete (`PATCH /artifacts/{id}/chunking-strategy`).

---

### 13. Issues & analyze

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R list | Y (all) | Y (all) | Y\* | Y\* | Y\* | **N** |
| U issue | Y | Y | Y\*\* | Y\*\* | Y\*\* | N |
| C analyze | Y | Y | Y | Y | N | N |

\*Non-admins: SQL filter to issues where `run_actor_id` or `triggered_by` is current user ([`project_issues.py`](../backend/app/routers/project_issues.py)). \*\*Same visibility rule before update.

**Cross-studio viewer:** `require_project_issues_readable` returns 403 before handler.

---

### 14. Knowledge graph

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R `GET .../graph` | Y | Y | Y | Y | Y | Y |
| C `POST .../graph/analyze-sections` | Y | Y | Y | Y | N | N |

---

### 15. Publish

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| C `POST .../publish` | Y | Y | Y | N | N | N |

*Enforced by:* `require_can_publish` → owning Studio Owner or Builder only (`can_publish` false for cross-studio grants).

---

### 16. Project chat (REST + WebSocket)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R history / WS | Y | Y | Y | Y | N | N |

*Enforced by:* explicit `is_studio_editor` check in [`project_chat.py`](../backend/app/routers/project_chat.py).

---

### 17. My token usage (`GET /me/token-usage`)

| | Platform admin | Studio owner | Builder | External | Studio Viewer | Viewer (cross-studio) |
|--|:---:|:---:|:---:|:---:|:---:|:---:|
| R | Y | Y | Y | Y† | Y | Y† |

†User must have **at least one** `studio_members` row OR be platform admin; otherwise 403 (“Viewer access does not include token usage”). Pure cross-studio user with **no** home membership: **N**.

---

### 18. MCP HTTP API (API keys — separate axis)

| | MCP key `viewer` | MCP key `editor` |
|--|:---:|:---:|
| Read work orders | Y | Y |
| Patch WO / add notes | N | Y |

*Enforced by:* [`mcp_api.py`](../backend/app/routers/mcp_api.py) `require_mcp_editor` vs `require_mcp_api_key`. Not mapped to the five human personas.

---

## Appendix A — Route inventory (authoritative `Depends`)

Auth ([`auth.py`](../backend/app/routers/auth.py)): `register`, `login`, `logout` — unauthenticated; `GET /auth/me`, `GET /auth/llm-runtime` — `get_current_user` (read-only LLM display for any authenticated user; no secrets).

| Router | Method | Path pattern | RBAC dependency |
|--------|--------|--------------|-----------------|
| admin | POST | `/admin/test/llm`, `/admin/test/embedding` | `require_platform_admin` |
| admin | GET | `/admin/console/overview` | `require_platform_admin` |
| admin | GET/POST | `/admin/studios` | `require_platform_admin` |
| admin | GET | `/admin/studios/{studio_id}` | `require_platform_admin` + `get_studio_for_platform_admin` |
| admin | GET | `/admin/studios/{studio_id}/gitlab` | `require_platform_admin` (read-only) |
| admin | GET/PUT | `/admin/studios/{studio_id}/llm-policy` | `require_platform_admin` |
| admin | GET/PUT/DELETE | `/admin/llm/providers/{provider_id}`, `/admin/llm/routing`, `/admin/llm/deployment` | `require_platform_admin` |
| admin | GET/PUT/PATCH/DELETE | `/admin/embeddings/*` | `require_platform_admin` |
| admin | GET/PUT | `/admin/config` | **404** (removed) |
| admin | GET/PUT | `/admin/cross-studio`, `/admin/cross-studio/{grant_id}` | **404** (removed) |
| admin | GET | `/admin/token-usage` | **404** (removed) |
| admin | GET/POST/PUT | `/admin/users`, `/admin/users/{id}/admin-status` | **404** (removed) |
| studios | GET | `/studios` | `get_current_user` |
| studios | POST | `/studios` | `get_current_user` |
| studios | GET/PATCH/DELETE | `/studios/{studio_id}` | `get_studio_access` / `require_studio_admin` |
| studios | GET/POST/DELETE/PATCH | `/studios/{studio_id}/members...` | `get_studio_access` / `require_studio_admin` |
| studios | POST | `/studios/{studio_id}/cross-studio-request` | `require_studio_admin` |
| studios | GET | `/studios/{studio_id}/cross-studio-incoming` | `get_current_user` + `ensure_studio_owner_membership` |
| studios | PUT | `/studios/{studio_id}/cross-studio-incoming/{grant_id}` | `get_current_user` + `ensure_studio_owner_membership` |
| studios | GET | `/studios/{studio_id}/cross-studio-outgoing` | `get_current_user` + `ensure_studio_owner_membership` |
| studios | PATCH | `/studios/{studio_id}/budget` | `require_studio_admin` |
| studios | GET | `/studios/{studio_id}/member-budgets` | `require_studio_admin` |
| studios | PATCH | `/studios/{studio_id}/members/{user_id}/budget` | `require_studio_admin` |
| studios | GET | `/studios/{studio_id}/token-usage` | `require_studio_admin` |
| studios | GET/POST/DELETE | `/studios/{studio_id}/mcp-keys...` | `require_studio_admin` |
| software | GET | `/studios/{studio_id}/software` | `get_studio_software_list_access` |
| software | POST | `/studios/{studio_id}/software` | `require_studio_admin` |
| software | GET/PUT/PATCH/DELETE | `/studios/{studio_id}/software/{id}` | `get_software_in_studio` / `require_software_editor_in_studio` / `require_software_admin_in_studio` |
| software | GET | `.../history` | `get_software_in_studio` |
| software | POST | `.../git/test` | `require_software_admin_in_studio` |
| projects | GET/POST | `/software/{software_id}/projects` | `get_software_access` / `require_software_home_editor` |
| projects | GET/PUT/DELETE | `/software/{software_id}/projects/{project_id}` | `get_project_access_nested` / `require_project_studio_admin_nested` |
| sections | GET | `/projects/{project_id}/sections` | `get_project_access` |
| sections | POST/reorder/DELETE | `.../sections...` | `require_outline_manager` |
| sections | GET | `.../context-preview` | `get_project_access` |
| sections | POST | `.../improve` | `require_project_member` |
| sections | GET/PATCH | `.../sections/{section_id}` | `get_project_access` / `require_project_member` |
| work_orders | GET / detail | `/projects/{project_id}/work-orders...` | `get_project_access` |
| work_orders | mutations | same prefix | `require_project_member` |
| private_threads | all | `/projects/{project_id}/sections/{section_id}/thread` | `require_project_member` |
| artifacts | POST/DELETE | `/projects/{project_id}/artifacts` | `require_project_member` |
| artifacts | GET list/download | same | `get_project_access` / `get_project_access_artifact_download` |
| project_issues | GET | `/projects/{project_id}/issues` | `require_project_issues_readable` + handler `is_studio_member` |
| project_issues | PUT/POST | `.../issues/{id}`, `.../analyze` | `require_project_member` |
| project_graph | GET/POST | `/projects/{project_id}/graph...` | `get_project_access` / `require_project_member` |
| project_publish | POST | `/projects/{project_id}/publish` | `require_can_publish` |
| project_chat | GET/WS | `/projects/{project_id}/chat`, `/ws/.../chat` | `get_project_access` + `is_studio_editor` |
| collab | WS | `/ws/projects/{project_id}/sections/{section_id}/collab` | `fetch_project_access` + `is_studio_editor` |
| me_token_usage | GET | `/me/token-usage` | `get_current_user` + membership check |
| mcp_api | GET/PATCH/POST | `/mcp/...` | MCP key deps |

---

## Appendix B — Doc / API alignment (done)

- **Architecture doc** §7 and `studio_members` / `cross_studio_access` comments updated in [`atelier-technical-architecture.md`](atelier-technical-architecture.md).
- **Frontend `api.ts`:** `addMember` / `updateMemberRole` accept `studio_viewer` alongside `studio_admin` and `studio_member`.

---

*Last generated as part of the RBAC module matrix implementation; update this file when adding routes or changing `deps.py`.*
