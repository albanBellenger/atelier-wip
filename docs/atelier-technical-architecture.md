# Atelier — Technical Architecture
_Version 2.3 — replaced LlamaIndex with LiteLLM in tech stack; corrected Knowledge Graph library label; documented Issues visibility by Viewer role; added codebase index feature section; added stale-draft notification job; added per-role token usage visibility; added emergency CLI reference_

---

## 1. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Tailwind + React Router | Component ecosystem, fast iteration |
| Backend | Python / FastAPI | Async-native, great WebSocket support |
| Database | PostgreSQL 16 + pgvector | Relational + vector search in one service |
| Auth | Email + password (JWT) | Simple, stateless, no external dependency |
| Real-time collab | Yjs + WebSocket | Most mature CRDT library, great CodeMirror binding |
| LLM | Agnostic via LiteLLM | Admin-configured provider; OpenAI-compatible proxy — supports OpenAI, Anthropic, Azure, and 100+ other providers |
| Embeddings | Same provider as LLM | Admin-configured; LiteLLM abstracts provider via OpenAI-compatible embeddings API |
| RAG | pgvector + LiteLLM | Custom chunking pipeline; LiteLLM for embeddings; pgvector HNSW for similarity search |
| File storage | MinIO (S3-compatible) | Self-hosted, Docker-friendly, S3 API compatible |
| Git integration | GitLab API (self-hosted) | No git binary on server; REST API only. GitHub planned for future phase. |
| Real-time chat | WebSockets (FastAPI) | Native FastAPI support, shares WS infrastructure with Yjs |
| MCP server | FastAPI (custom MCP endpoint) | Exposes Work Orders to coding agents (Cursor, Claude Code) |
| Knowledge Graph | React Force Graph (frontend) | Force-directed interactive graph, lightweight |
| Deployment | Docker Compose | Simple self-hosted deployment |

---

## 2. High-Level Component Map

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (React)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │  Spec    │ │ Project  │ │Knowledge │ │  Work Order    │ │
│  │  Editor  │ │  Chat    │ │  Graph   │ │  Board         │ │
│  │(Yjs+CM) │ │  (WS)    │ │(rfg-2d)  │ │  (Kanban)      │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬────────┘ │
└───────┼────────────┼────────────┼────────────────┼──────────┘
        │ REST/SSE   │ WS         │ REST           │ REST
┌───────▼────────────▼────────────▼────────────────▼──────────┐
│                       FastAPI Backend                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   Auth   │ │  Studio  │ │  Project │ │     LLM      │   │
│  │ Service  │ │ Service  │ │ Service  │ │   Service    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   RAG    │ │  Work    │ │  Drift   │ │    Graph     │   │
│  │ Service  │ │  Order   │ │ Service  │ │   Service    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Collab   │ │  Chat    │ │ Publish  │ │     MCP      │   │
│  │ WS       │ │  WS      │ │ Service  │ │   Server     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└───────────────────────────┬──────────────────────────────────┘
                            │
           ┌────────────────┼──────────────────┐
           ▼                ▼                  ▼
      ┌─────────┐    ┌──────────┐       ┌──────────┐
      │Postgres │    │ pgvector │       │  MinIO   │
      │  (data) │    │(embeddings│      │  (files) │
      └─────────┘    └──────────┘       └──────────┘
           ▼
      ┌─────────┐
      │  GitLab  │
      │ (self-hosted) │
      └─────────┘
                            ▲
                 IDE (Cursor / Claude Code)
                 pulls Work Orders via MCP
```

---

## 3. Data Models

### `users`
```sql
id            UUID PRIMARY KEY,
email         TEXT UNIQUE NOT NULL,
password_hash TEXT NOT NULL,
display_name  TEXT NOT NULL,
is_platform_admin BOOLEAN DEFAULT FALSE,
created_at    TIMESTAMPTZ DEFAULT NOW()
```

### `embedding_dimension_state`
Runtime bookkeeping only (no credentials): first observed embedding vector width from LiteLLM responses, used to detect mismatches against fixed `vector(1536)` chunk columns. Singleton row `id = 1`.
```sql
id           INTEGER PRIMARY KEY,  -- fixed to 1
observed_dim INTEGER               -- nullable until first successful embed
```

### `studios`
```sql
id          UUID PRIMARY KEY,
name        TEXT NOT NULL,
description TEXT,
logo_path   TEXT,
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `studio_members`
```sql
studio_id  UUID REFERENCES studios(id) ON DELETE CASCADE,
user_id    UUID REFERENCES users(id),
role       TEXT NOT NULL,   -- studio_admin | studio_member | studio_viewer
joined_at  TIMESTAMPTZ DEFAULT NOW(),
PRIMARY KEY (studio_id, user_id)
```

Persisted values map to FR v2.2 home-studio labels: `studio_admin` → Studio Owner, `studio_member` → Studio Builder, `studio_viewer` → Studio Viewer (read-only within the studio; see FR). A database `CHECK` constraint (`ck_studio_members_role_allowed`, migration `w1x2y3z4a5b7`) enforces these three literals only.

### `cross_studio_access`
```sql
id               UUID PRIMARY KEY,
requesting_studio_id  UUID REFERENCES studios(id),
target_software_id    UUID REFERENCES software(id),
requested_by     UUID REFERENCES users(id),
approved_by      UUID REFERENCES users(id),   -- tool admin
access_level     TEXT DEFAULT 'viewer',        -- viewer | external_editor
status           TEXT DEFAULT 'pending',       -- pending | approved | rejected
created_at       TIMESTAMPTZ DEFAULT NOW(),
resolved_at      TIMESTAMPTZ
```

`viewer` = FR cross-studio **Viewer** (read-only on the granted software). `external_editor` = FR cross-studio **External** (edit scope on that software only; not the same as MCP key `access_level` viewer/editor on `mcp_keys`).

### `mcp_keys` (separate from cross-studio)

MCP API keys use their own `access_level` (`viewer` | `editor`) on the `mcp_keys` table — do not confuse with `cross_studio_access.access_level`.

### `software`
```sql
id           UUID PRIMARY KEY,
studio_id    UUID REFERENCES studios(id) ON DELETE CASCADE,
name         TEXT NOT NULL,
description  TEXT,
definition   TEXT,          -- system prompt for all LLM calls within this software
git_provider TEXT DEFAULT 'gitlab',  -- gitlab only (github: future phase)
git_repo_url TEXT,
git_token    TEXT,          -- encrypted at rest (Fernet)
git_branch   TEXT DEFAULT 'main',
created_at   TIMESTAMPTZ DEFAULT NOW(),
updated_at   TIMESTAMPTZ DEFAULT NOW()
```

### `projects`
```sql
id                   UUID PRIMARY KEY,
software_id          UUID REFERENCES software(id) ON DELETE CASCADE,
name                 TEXT NOT NULL,
description          TEXT,
publish_folder_slug  TEXT NOT NULL,   -- unique per software; git export root folder
archived             BOOLEAN NOT NULL DEFAULT FALSE,
created_at           TIMESTAMPTZ DEFAULT NOW(),
updated_at           TIMESTAMPTZ DEFAULT NOW(),
last_published_at    TIMESTAMPTZ,     -- nullable; last successful publish timestamp
UNIQUE (software_id, publish_folder_slug)
-- Index ix_projects_software_archived on (software_id, archived) for list filtering
```

### `sections`
```sql
id           UUID PRIMARY KEY,
project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,    -- nullable; set when section belongs to a Project
software_id  UUID REFERENCES software(id) ON DELETE CASCADE,    -- nullable; set when section belongs to Software Docs
title        TEXT NOT NULL,
slug         TEXT NOT NULL,
"order"      INTEGER NOT NULL,
content      TEXT DEFAULT '',                                    -- plain text Markdown, extracted from Yjs doc (used by RAG)
yjs_state    BYTEA,                                              -- binary Yjs document state
created_at   TIMESTAMPTZ DEFAULT NOW(),
updated_at   TIMESTAMPTZ DEFAULT NOW(),
CHECK ((project_id IS NOT NULL AND software_id IS NULL)
    OR (project_id IS NULL AND software_id IS NOT NULL))         -- exactly one owner
    
```

### `artifacts`
```sql
id                UUID PRIMARY KEY,
scope_level       TEXT NOT NULL DEFAULT 'project',  -- studio | software | project
project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,  -- NULL when scope is studio or software
library_studio_id UUID REFERENCES studios(id) ON DELETE CASCADE,   -- set when scope_level = 'studio'
library_software_id UUID REFERENCES software(id) ON DELETE CASCADE, -- set when scope_level = 'software'
uploaded_by       UUID REFERENCES users(id),
name              TEXT NOT NULL,
file_type         TEXT NOT NULL,   -- pdf | md
storage_path      TEXT NOT NULL,   -- project: {project_id}/{artifact_id}/{file}; software: software/{id}/...; studio: studio/{id}/...
size_bytes        BIGINT NOT NULL DEFAULT 0,
created_at        TIMESTAMPTZ DEFAULT NOW()
-- CHECK ck_artifacts_scope_fks: exactly one ownership pattern (project vs software vs studio) per row; see migration.
```

Rows with `scope_level = 'project'` require `project_id` and null library FKs. Software-scoped library files use `library_software_id` and null `project_id`. Studio-scoped files use `library_studio_id` only. Object keys in MinIO never rely on a null `project_id`.

### `artifact_chunks`
```sql
id          UUID PRIMARY KEY,
artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
chunk_index INTEGER NOT NULL,
content     TEXT NOT NULL,
embedding   vector(1536)
```

### `section_chunks`
```sql
id          UUID PRIMARY KEY,
section_id  UUID REFERENCES sections(id) ON DELETE CASCADE,
chunk_index INTEGER NOT NULL,
content     TEXT NOT NULL,
embedding   vector(1536)
```

### Codebase index (`codebase_snapshots`, `codebase_files`, `codebase_chunks`, `codebase_symbols`)
Software-scoped mirror of the linked GitLab repository for embedding-backed retrieval (Slice 16b–c).

```sql
-- codebase_snapshots: one row per indexing attempt
id UUID PRIMARY KEY,
software_id UUID REFERENCES software(id) ON DELETE CASCADE,
commit_sha TEXT NOT NULL,
branch TEXT NOT NULL,
status TEXT NOT NULL,   -- pending | indexing | ready | failed | superseded
error_message TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
ready_at TIMESTAMPTZ,
triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL

-- codebase_files: blobs selected under caps (max files / bytes per snapshot)
id UUID PRIMARY KEY,
snapshot_id UUID REFERENCES codebase_snapshots(id) ON DELETE CASCADE,
path TEXT NOT NULL,
blob_sha TEXT NOT NULL,
size_bytes INTEGER NOT NULL,
language TEXT,
UNIQUE (snapshot_id, path)

-- codebase_chunks: embedded fragments (HNSW index on embedding)
id UUID PRIMARY KEY,
snapshot_id UUID REFERENCES codebase_snapshots(id) ON DELETE CASCADE,
file_id UUID REFERENCES codebase_files(id) ON DELETE CASCADE,
chunk_index INTEGER NOT NULL,
content TEXT NOT NULL,
embedding vector(1536) NOT NULL,
start_line INTEGER,
end_line INTEGER

-- codebase_symbols: optional AST symbol rows for navigation / graph heuristics
id UUID PRIMARY KEY,
snapshot_id UUID REFERENCES codebase_snapshots(id) ON DELETE CASCADE,
file_id UUID REFERENCES codebase_files(id) ON DELETE CASCADE,
name TEXT NOT NULL,
kind TEXT NOT NULL,
start_line INTEGER NOT NULL,
end_line INTEGER NOT NULL
```

Indexing honours `ATELIER_CODEBASE_INDEX_MAX_FILES`, `ATELIER_CODEBASE_INDEX_MAX_TOTAL_BYTES`, and `ATELIER_CODEBASE_INDEX_MAX_FILE_BYTES` (see `Settings` in backend). Vector similarity uses HNSW on `codebase_chunks.embedding` (`vector_cosine_ops`), consistent with other chunk tables. Diagnostics combine **networkx** PageRank over a lightweight file adjacency graph (LRU-scoped per `(snapshot_id, token_budget)` fingerprint) with pgvector hits.

### `work_orders`
```sql
id                   UUID PRIMARY KEY,
project_id           UUID REFERENCES projects(id) ON DELETE CASCADE,
title                TEXT NOT NULL,
description          TEXT NOT NULL,
implementation_guide TEXT,
acceptance_criteria  TEXT,
status               TEXT DEFAULT 'backlog',  -- backlog | in_progress | in_review | done | archived
phase                TEXT,
assignee_id          UUID REFERENCES users(id),
is_stale             BOOLEAN DEFAULT FALSE,
stale_reason         TEXT,
stale_dismissed_by   UUID REFERENCES users(id),
stale_dismissed_at   TIMESTAMPTZ,
created_by           UUID REFERENCES users(id),
created_at           TIMESTAMPTZ DEFAULT NOW(),
updated_at           TIMESTAMPTZ DEFAULT NOW()
```

### `work_order_sections` (many-to-many)
```sql
work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
section_id    UUID REFERENCES sections(id) ON DELETE CASCADE,
PRIMARY KEY (work_order_id, section_id)
```

### `work_order_notes`
```sql
id            UUID PRIMARY KEY,
work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
author_id     UUID REFERENCES users(id),
source        TEXT DEFAULT 'user',   -- user | mcp
content       TEXT NOT NULL,
created_at    TIMESTAMPTZ DEFAULT NOW()
```

### `graph_edges`
```sql
id           UUID PRIMARY KEY,
project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
source_type  TEXT NOT NULL,   -- section | artifact | work_order | issue
source_id    UUID NOT NULL,
target_type  TEXT NOT NULL,
target_id    UUID NOT NULL,
edge_type    TEXT NOT NULL,   -- generates | involves | references | informed_by | depends_on | drifts_from_code | suggests_doc_update
created_at   TIMESTAMPTZ DEFAULT NOW(),
UNIQUE (source_type, source_id, target_type, target_id, edge_type)
```

### `private_threads`
```sql
id         UUID PRIMARY KEY,
user_id    UUID REFERENCES users(id),
section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
created_at TIMESTAMPTZ DEFAULT NOW(),
UNIQUE (user_id, section_id)
```

### `thread_messages`
```sql
id         UUID PRIMARY KEY,
thread_id  UUID REFERENCES private_threads(id) ON DELETE CASCADE,
role       TEXT NOT NULL,   -- user | assistant
content    TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `chat_messages`
```sql
id         UUID PRIMARY KEY,
project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
user_id    UUID REFERENCES users(id),
role       TEXT NOT NULL,   -- user | assistant
content    TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `software_chat_messages`
```sql
id          UUID PRIMARY KEY,
software_id UUID REFERENCES software(id) ON DELETE CASCADE,
user_id     UUID REFERENCES users(id),
role        TEXT NOT NULL,   -- user | assistant
content     TEXT NOT NULL,
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `issues`
```sql
id              UUID PRIMARY KEY,
project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,    -- nullable; NULL when the issue is software-scoped (e.g. drift on a Software Doc section)
software_id     UUID REFERENCES software(id) ON DELETE CASCADE,    -- nullable; set on every code-drift and doc-sync row
work_order_id   UUID REFERENCES work_orders(id) ON DELETE CASCADE, -- nullable; set on code_drift_work_order and doc_update_suggested rows
kind            TEXT NOT NULL DEFAULT 'conflict_or_gap',
                -- conflict_or_gap | code_drift_section | code_drift_work_order | doc_update_suggested
section_a_id    UUID REFERENCES sections(id),
section_b_id    UUID REFERENCES sections(id),
description     TEXT NOT NULL,
status          TEXT DEFAULT 'open',                                -- open | resolved
origin          TEXT DEFAULT 'manual',                              -- manual | auto
run_actor_id    UUID REFERENCES users(id),
payload_json    JSONB,                                              -- per-kind extra data; see below
resolution_reason TEXT,                                             -- nullable; e.g. 'applied' | 'dismissed' | NULL
created_at      TIMESTAMPTZ DEFAULT NOW(),
CHECK (project_id IS NOT NULL OR software_id IS NOT NULL)
```

### `mcp_keys`
```sql
id         UUID PRIMARY KEY,
studio_id  UUID REFERENCES studios(id) ON DELETE CASCADE,
user_id    UUID REFERENCES users(id),   -- key owner
label      TEXT NOT NULL,               -- e.g. "John's Cursor key"
key_hash   TEXT NOT NULL,               -- bcrypt hash of the API key
access_level TEXT DEFAULT 'editor',     -- viewer | editor
last_used_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW(),
revoked_at TIMESTAMPTZ
```

### `token_usage`
```sql
id           UUID PRIMARY KEY,
studio_id    UUID REFERENCES studios(id),
software_id  UUID REFERENCES software(id),
project_id   UUID REFERENCES projects(id),
user_id      UUID REFERENCES users(id),
call_source TEXT NOT NULL,   -- free-form discriminator; see **call_source values** below
model        TEXT NOT NULL,
input_tokens INTEGER NOT NULL,
output_tokens INTEGER NOT NULL,
estimated_cost_usd NUMERIC(10,6),
created_at   TIMESTAMPTZ DEFAULT NOW()
```

**`call_source` values (aligned with `backend/app/` as of this document):** The column is **not** a database enum — there is no `CHECK` constraint; new features may introduce new strings (stored as `VARCHAR(32)`, truncated on insert in `token_tracker`). Budget and LLM routing treat `call_source` as a label; [`llm_routing_buckets.py`](../backend/app/services/llm_routing_buckets.py) maps strings to routing buckets (`chat`, `code_gen`, `classification`, `embeddings`) and lists extra examples used for policy UI (`mcp_wo`, `work_order`) even when not every path persists them.

- **Chats:** Project chat and software chat both persist **`chat`**. Distinguish them in reporting or CSV filters using scope columns: **non-null `project_id`** (project chat) vs **non-null `software_id`** with project context as appropriate (software chat), not by `call_source` alone.
- **Private thread / slash-style thread tools:** `private_thread`, `thread_conflict_scan`, `thread_patch_append`, `thread_patch_replace`, `thread_patch_edit` (some readiness paths use `chat`).
- **Work orders & MCP:** `work_order_gen`, `work_order_dedupe`, `mcp` (MCP list/pull accounting uses synthetic `model` names such as `mcp_list_work_orders` / `mcp_context_pull` where applicable).
- **Spec & graph analysis:** `conflict`, `drift`, `section_drift`, `graph`.
- **Other LLM product surfaces:** `section_improve`, `builder_composer_hint`, `citation_health`, `rag_software_definition_summary`.
- **Embeddings:** Default bulk/path embedding charges use **`embedding`**; codebase snapshot indexing and query embedding use **`codebase_index`** and **`codebase_rag`** respectively (see functional requirements §9b.8).
- **Software-docs codebase agents (Slice 16):** `backprop_outline`, `backprop_section`, `code_drift_section`, `code_drift_work_order`, `doc_sync`.
- **Platform:** `admin_connectivity_probe`.

### `codebase_snapshots`  

```sql
id                     UUID PRIMARY KEY,
software_id            UUID REFERENCES software(id) ON DELETE CASCADE,
commit_sha             TEXT NOT NULL,
branch                 TEXT NOT NULL,
status                 TEXT NOT NULL,                       -- pending | indexing | ready | failed | superseded
error_message          TEXT,
triggered_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
created_at             TIMESTAMPTZ DEFAULT NOW(),
ready_at               TIMESTAMPTZ
```

### `codebase_files` 

```sql
id           UUID PRIMARY KEY,
snapshot_id  UUID REFERENCES codebase_snapshots(id) ON DELETE CASCADE,
path         TEXT NOT NULL,
blob_sha     TEXT NOT NULL,
size_bytes   INTEGER NOT NULL,
language     TEXT,                                          -- tree-sitter language key, or NULL for fallback chunker
UNIQUE (snapshot_id, path)
```

### `codebase_chunks` 

```sql
id            UUID PRIMARY KEY,
snapshot_id   UUID REFERENCES codebase_snapshots(id) ON DELETE CASCADE,
file_id       UUID REFERENCES codebase_files(id) ON DELETE CASCADE,
chunk_index   INTEGER NOT NULL,
content       TEXT NOT NULL,
embedding     vector(N) NOT NULL,                           -- N = current embedding dimension
start_line    INTEGER,
end_line      INTEGER
```

### `codebase_symbols` 

```sql
id            UUID PRIMARY KEY,
snapshot_id   UUID REFERENCES codebase_snapshots(id) ON DELETE CASCADE,
file_id       UUID REFERENCES codebase_files(id) ON DELETE CASCADE,
name          TEXT NOT NULL,
kind          TEXT NOT NULL,                                -- function | method | class | interface | module
start_line    INTEGER NOT NULL,
end_line      INTEGER NOT NULL
```
### Database Indexes
```sql
-- Vector similarity search
-- HNSW (Hierarchical Navigable Small World) is used instead of IVFFlat.
-- IVFFlat requires a training step (centroid calculation) on pre-existing data,
-- which causes poor recall when the index is built on an empty or sparse table.
-- HNSW requires no training, handles incremental inserts correctly from the start,
-- and offers faster query performance. Supported by pgvector >= 0.5.0 (ships with Postgres 16).
CREATE INDEX ON artifact_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON section_chunks  USING hnsw (embedding vector_cosine_ops);

-- Common query patterns
CREATE INDEX ON sections       (project_id, "order");
CREATE INDEX ON work_orders    (project_id, status);
CREATE INDEX ON work_orders    (project_id, is_stale);
CREATE INDEX ON work_orders    (assignee_id);
CREATE INDEX ON chat_messages  (project_id, created_at);
CREATE INDEX ON software_chat_messages (software_id, created_at);
CREATE INDEX ON thread_messages(thread_id,  created_at);
CREATE INDEX ON issues         (project_id, status);
CREATE INDEX ON graph_edges    (project_id, source_type, source_id);
CREATE INDEX ON graph_edges    (project_id, target_type, target_id);
CREATE INDEX ON token_usage    (studio_id,  created_at);
CREATE INDEX ON token_usage    (user_id,    created_at);
CREATE INDEX ON mcp_keys       (studio_id,  revoked_at);
CREATE INDEX ix_codebase_chunks_snapshot ON codebase_chunks (snapshot_id);
CREATE INDEX ix_codebase_chunks_embedding_hnsw
  ON codebase_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ix_codebase_snapshots_software_status
  ON codebase_snapshots (software_id, status);
CREATE UNIQUE INDEX uq_sections_project_id_slug
  ON sections (project_id, slug)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX uq_sections_software_id_slug
  ON sections (software_id, slug)
  WHERE software_id IS NOT NULL;

CREATE INDEX ix_sections_software_order
  ON sections (software_id, "order")
  WHERE software_id IS NOT NULL;
CREATE INDEX ix_issues_kind_status ON issues (kind, status);
CREATE INDEX ix_issues_software_kind_status ON issues (software_id, kind, status)
  WHERE software_id IS NOT NULL;
CREATE INDEX ix_codebase_symbols_snapshot_name ON codebase_symbols (snapshot_id, name);
CREATE INDEX ix_codebase_symbols_snapshot_kind ON codebase_symbols (snapshot_id, kind);

```

---

## 4. Backend Services

### In-app notifications (write path)

Per-user inbox rows are inserted via `NotificationDispatchService` from:

- **ArtifactService** — artifact embedding finished (`artifact_embedded`); artifact deleted (`artifact_deleted`)
- **Collab WebSocket** — another editor updated spec content (`section_updated`)
- **PublishService** — successful publish to GitLab (`publish_commit`)
- **WorkOrderService** — work order status change (`work_order_status`)
- **Stale-unpublished reminder job** — `draft_unpublished` when section edits are old relative to last publish (see functional requirements §18.1). Implemented in `draft_unpublished_notification_job`; uses `insert_many` rather than a dedicated dispatch helper. Runs only when `ATELIER_STALE_DRAFT_NOTIFIER=1` (daily loop in app lifespan), or when a platform administrator calls `POST /admin/jobs/stale-draft-notifications`.

Listing and read/unread updates use `NotificationService` (e.g. `/me/notifications`).

### AuthService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/register` | POST | Public | Create user, return JWT. First user gets `is_platform_admin=true` |
| `/auth/login` | POST | Public | Verify credentials, return JWT |
| `/auth/me` | GET | JWT | Return current user + per-studio roles |

### AdminService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/admin/test/embedding` | POST | Tool Admin | Connectivity probe for embeddings (platform resolution via LLM registry + embeddings routing rule) |
| `/admin/config` | GET/PUT | Tool Admin | **Not registered** (default **404**; removed); configure providers and embeddings routing in Admin Console → LLM |
| `/admin/cross-studio` | GET | Tool Admin | **Not registered** (default **404**; removed); pending approvals use studio routes (`GET/PUT …/cross-studio-incoming…`) |
| `/admin/cross-studio/{id}` | PUT | Tool Admin | **Not registered** (default **404**; removed; same as above) |
| `/admin/token-usage` | GET | Tool Admin | **Not registered** (default **404**; removed); use `GET /studios/{id}/token-usage` (studio admin) or `GET /me/token-usage` |
| `/admin/users` | GET/POST | Tool Admin | User directory / create user (`require_platform_admin`) |
| `/admin/users/{id}/admin-status` | PUT | Tool Admin | Set platform admin flag (`require_platform_admin`) |

**Emergency CLI recovery:** if all Tool Admin accounts are inaccessible, a sysadmin with shell access to the backend container can grant Tool Admin status (creating the user if needed) without touching the database directly:

```bash
cd backend
python manage.py create-admin --email admin@example.com
# Optional: python manage.py create-admin --email admin@example.com --password <value>
# Optional: python manage.py list-admins
```

Omitting `--password` generates a random 16-character password printed once. Defined in `backend/manage.py`; see `docs/admin-setup.md` and the README `Emergency recovery` section.

### StudioService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/studios` | POST | JWT | Create studio (creator becomes Studio Owner) |
| `/studios` | GET | JWT | List studios the user belongs to |
| `/studios/{id}` | GET | Studio Builder | Studio detail |
| `/studios/{id}` | PUT | Studio Owner | Update name, description, logo |
| `/studios/{id}/members` | GET | Studio Builder | List members |
| `/studios/{id}/members` | POST | Studio Owner | Invite by email |
| `/studios/{id}/members/{uid}` | DELETE | Studio Owner | Remove member |
| `/studios/{id}/members/{uid}/role` | PUT | Studio Owner | Change member role |
| `/studios/{id}/cross-studio-request` | POST | Studio Owner | Request access to another studio's software |
| `/studios/{id}/token-usage` | GET | Studio Owner | Studio token usage |
| `/studios/{id}/mcp-keys` | GET | Studio Owner | List MCP keys |
| `/studios/{id}/mcp-keys` | POST | Studio Owner | Generate new MCP key |
| `/studios/{id}/mcp-keys/{kid}` | DELETE | Studio Owner | Revoke MCP key |

### SoftwareService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/studios/{id}/software` | POST | Studio Owner | Create software |
| `/studios/{id}/software` | GET | Studio Builder | List software in studio |
| `/studios/{id}/software/{sid}` | GET | Studio Builder | Software detail + projects |
| `/studios/{id}/software/{sid}` | PUT | Studio Owner | Update name, description, definition, git config |
| `/studios/{id}/software/{sid}` | DELETE | Studio Owner | Delete software + cascade |
| `/studios/{id}/software/{sid}/git-test` | POST | Studio Owner | Validate git connection |

### ProjectService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/software/{sid}/projects` | POST | Studio Builder+ | Create project |
| `/software/{sid}/projects` | GET | Studio Builder | List projects; optional `?include_archived=true` (default hides archived) |
| `/studios/{id}/projects` | GET | Studio Builder | All projects in studio (flattened); optional `?include_archived=true` |
| `/software/{sid}/projects/{pid}` | GET | Studio Builder | Project detail + sections |
| `/software/{sid}/projects/{pid}` | PUT | Studio Owner | Update name, description, publish folder slug |
| `/software/{sid}/projects/{pid}` | PATCH | Studio Builder+ | Archive or unarchive (JSON body `archived` boolean); owning studio only |
| `/software/{sid}/projects/{pid}` | DELETE | Studio Owner | Delete project + cascade |

### SectionService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/sections` | POST | Studio Owner | Create section |
| `/projects/{pid}/sections` | GET | Member/Viewer | List sections ordered |
| `/projects/{pid}/sections/{sid}` | GET | Member/Viewer | Section detail + content |
| `/projects/{pid}/sections/{sid}` | PUT | Studio Owner | Update title, slug, order |
| `/projects/{pid}/sections/{sid}` | DELETE | Studio Owner | Delete section |

### ArtifactService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/artifacts` | POST | Studio Builder | Upload PDF or MD (project scope) |
| `/projects/{pid}/artifacts` | GET | Member/Viewer | List project-scoped artifacts |
| `/projects/{pid}/artifacts/{aid}/download` | GET | Member/Viewer | Proxied file download (streamed through FastAPI) |
| `/projects/{pid}/artifacts/{aid}` | DELETE | Studio Builder | Delete artifact + chunks |
| `/studios/{sid}/artifacts` | POST | Owner or Builder | Upload PDF or MD (studio library scope) |
| `/studios/{sid}/artifacts/md` | POST | Owner or Builder | Create Markdown artifact (studio scope) |
| `/studios/{sid}/artifact-library` | GET | Member/Viewer (studio list rules) | Unified library list; optional `?softwareId=` filter |
| `/software/{swid}/artifacts` | POST | Software editor (owning studio) | Upload PDF or MD (software library scope) |
| `/software/{swid}/artifacts/md` | POST | Same | Create Markdown artifact (software scope) |
| `/artifacts/{aid}/download` | GET | Authorized reader | Download any artifact the user may read (all scopes) |

**Download security note:** the download endpoint streams the file content directly from MinIO through FastAPI to the client — it does **not** generate a presigned URL. This ensures all downloads are gated by JWT validation and never bypass Atelier's auth layer. MinIO is configured as strictly private (no public bucket policy, no internet-facing exposure). This is the correct default for confidential corporate specs.

**Artifact library visibility:** project-scoped files appear on their project’s software aggregate and in the studio library when not excluded. Software-scoped files belong to one software and appear on that software’s list and in the studio library. Studio-scoped files are visible only at studio level (not on per-software lists). The `GET /studios/{sid}/artifact-library` endpoint returns a merged, sorted view for the Artifact library UI, honoring the same exclusion flags as software-scoped lists where applicable.

### WorkOrderService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/work-orders` | POST | Studio Builder | Create work order manually |
| `/projects/{pid}/work-orders/generate` | POST | Studio Builder | LLM auto-generate from section(s) |
| `/projects/{pid}/work-orders` | GET | Member/Viewer | List work orders (filterable) |
| `/projects/{pid}/work-orders/{wid}` | GET | Member/Viewer | Work order detail |
| `/projects/{pid}/work-orders/{wid}` | PUT | Studio Builder | Update work order |
| `/projects/{pid}/work-orders/{wid}` | DELETE | Studio Builder | Delete work order |
| `/projects/{pid}/work-orders/{wid}/dismiss-stale` | POST | Studio Builder | Dismiss stale flag |
| `/projects/{pid}/work-orders/{wid}/notes` | POST | Studio Builder | Add note |

On status transition to `Done`:

1. Existing behaviour (notifications, activity) unchanged.
2. **NEW:** schedule `DocSyncService.propose_for_work_order` as a background task with the status-changer as `run_actor_id`. Best-effort; never blocks the status change; failure is logged and swallowed.

### ThreadService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/sections/{sid}/thread` | GET | Studio Builder | Get or create thread + history |
| `/projects/{pid}/sections/{sid}/thread/messages` | POST | Studio Builder | Send message (SSE stream) |

### ChatService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/chat` | GET | Studio Builder | Paginated project chat history |
| `/software/{sid}/chat` | GET | Studio Builder | Paginated software chat history |

### PublishService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/publish` | POST | Studio Builder | Publish spec + work orders to git |
| `/software/{sid}/history` | GET | Member/Viewer | Commit history timeline |

After a successful publish:

1. Existing behaviour (write project files, run conflict/gap analysis, drift detection on work orders) is unchanged.
2. **NEW:** if the software has a `ready` codebase snapshot, schedule `CodeDriftService.run_for_software` as a background task with the publishing user as `run_actor_id`. The publish never blocks on this. Failure is logged and swallowed.
3. **NEW:** publish Software Docs to `<repo_root>/docs/<section-slug>.md` and a generated `<repo_root>/docs/README.md` with the docs outline.

### ConflictService
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/analyze` | POST | Studio Builder | Manual conflict analysis trigger |
| `/projects/{pid}/issues` | GET | Member (filtered by role — see note) | List issues |
| `/projects/{pid}/issues/{iid}` | PUT | Studio Builder | Update issue status |

**Issues visibility by role** (`GET /projects/{pid}/issues`):
- **Tool Admin, Studio Owner, Studio Builder** — full access, all issue kinds.
- **Studio Viewer** (home-studio read-only role) — read access; issues list visible but no analysis can be triggered. Enforced by `require_project_issues_readable` in `deps.py` which passes home-studio Viewers through.
- **Cross-studio External** — read access (editor-level grant, same as Builder for read).
- **Cross-studio Viewer** — blocked (403). `require_project_issues_readable` raises `FORBIDDEN` for `is_cross_studio_viewer=true`. This mirrors FR §4.3 where the cross-studio Viewer row shows ❌ for "View issues".

### GraphService (internal + endpoint)
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/projects/{pid}/graph` | GET | Member/Viewer | Full graph data (nodes + edges) |

Internal methods:
- `add_edge(project_id, source_type, source_id, target_type, target_id, edge_type)` — called by other services when relationships are created
- `remove_edges_for(node_type, node_id)` — called on deletion
- `detect_section_relationships(project_id)` — LLM-based scan to find implicit cross-section references, called on publish

### DriftService (internal)
- `check_work_order_drift(work_order_id)` — called after every section save (debounced 5s)
  1. Fetch work order description + acceptance criteria
  2. Fetch full content of all linked sections
  3. LLM compares: "Has this section changed significantly enough to invalidate this work order? Answer YES/NO and explain."
  4. If YES: set `work_orders.is_stale = true`, `stale_reason = explanation`, insert token_usage record
  5. Update graph edge highlight status

### TokenTracker (internal middleware)
- Wraps every LLM call in `LLMService`
- After each call: insert row into `token_usage` with studio, software, project, user, call source, model, token counts, estimated cost
- Estimated cost calculated from a static pricing table keyed by `(provider, model)` — updateable by Tool Admin

### LLMService (internal)
```python
async def chat_stream(
    messages: list[dict],
    system_prompt: str,
    call_source: str,
    context: TokenContext,          # studio_id, software_id, project_id, user_id
    structured_output: dict | None = None   # optional JSON schema for structured calls
) -> AsyncIterator[str]: ...

async def chat_structured(
    messages: list[dict],
    system_prompt: str,
    call_source: str,
    context: TokenContext,
    output_schema: dict             # required — JSON schema defining expected output shape
) -> dict: ...                      # returns parsed dict, never raw string
```
- Resolves chat credentials from `llm_provider_registry` and routing rules (updates apply on registry writes)
- Automatically records token usage via TokenTracker on every call
- Supports OpenAI, Anthropic, Azure, and any LiteLLM-supported provider via the OpenAI-compatible proxy interface
- **Structured output abstraction:** `chat_structured` translates the `output_schema` to the correct provider mechanism:
  - **OpenAI / Azure:** `response_format = {"type": "json_schema", "json_schema": output_schema}`
  - **Anthropic:** XML-tagged output via system prompt instruction + post-response JSON extraction
  - **Others:** JSON-mode system prompt instruction + post-response parsing with retry on parse failure
- All structured calls (Work Order generation, conflict analysis, drift detection) use `chat_structured` — never `chat_stream`
- Streaming (`chat_stream`) is reserved for user-facing conversational calls (private threads, project chat) where deterministic structure is not required

**EmbeddingService** (internal) resolves embedding model strings and API keys the same way: `llm_provider_registry` plus the **embeddings** use case in `llm_routing_rules`; studio-scoped jobs additionally respect `studio_llm_provider_policy` provider enablement without requiring chat `selected_model` to match the embedding model id. Observed vector width is recorded in `embedding_dimension_state`.

### RAGService (internal)
```python
async def build_context(
    query: str,
    project_id: UUID,
    current_section_id: UUID | None,
    token_budget: int = 6000
) -> str: ...
```
Assembly order:
1. Software Definition
2. Software Docs outline (titles + plain-text content, trimmed under budget pressure like the Project outline)
3. Project outline (existing)
4. Current section (existing)
5. Retrieved chunks (existing)

Software Docs sections also participate in similarity-based retrieval over `section_chunks` — they appear naturally in the retrieved chunks block when relevant.

Budget overflow order is unchanged in intent (trim Project outline first), but the helper now distinguishes two outline blocks. See `_split_outline_blocks` in `rag_service.py` for the implementation.


### GitService (internal)
Wraps the self-hosted GitLab REST API. GitHub support is planned for a future phase — the abstraction layer is intentionally kept provider-agnostic internally so GitHub can be added without touching call sites.

```python
async def commit_files(
    repo_url: str, token: str,
    branch: str, files: dict[str, str], message: str
) -> str: ...   # returns commit URL

async def get_history(
    repo_url: str, token: str, branch: str
) -> list[Commit]: ...
```

### MCP Server
```
/mcp/v1/work-orders          GET    List work orders (auth: MCP API key)
/mcp/v1/work-orders/{wid}    GET    Pull work order + full context
/mcp/v1/work-orders/{wid}    PATCH  Update status
/mcp/v1/work-orders/{wid}/notes POST  Post note from IDE
```

MCP key validation:
1. Hash incoming key, look up in `mcp_keys`
2. Check `revoked_at IS NULL`
3. Derive studio scope from key
4. Enforce access level (viewer vs editor)
5. Update `last_used_at`, insert `token_usage` record for context retrieval

Work order pull payload:
```json
{
  "id": "...",
  "title": "...",
  "description": "...",
  "acceptance_criteria": "...",
  "phase": "...",
  "status": "...",
  "software_definition": "...",
  "linked_sections": [
    { "title": "Data Model", "content": "..." }
  ],
  "artifact_context": "...",
  "related_work_orders": [
    { "id": "...", "title": "...", "status": "..." }
  ]
}
```
### SoftwareDocsSectionService 

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/software/{sid}/docs` | POST | Studio Owner | Create Software Docs section (outline change) |
| `/software/{sid}/docs` | GET | Studio Member / Viewer / granted External | List sections ordered by `order` |
| `/software/{sid}/docs/{secid}` | GET | Studio Member / Viewer / granted External | Get one section |
| `/software/{sid}/docs/{secid}` | PATCH | Studio Builder+ for content; Studio Owner only for title/slug/order changes | Update section |
| `/software/{sid}/docs/{secid}` | DELETE | Studio Owner | Delete section |
| `/software/{sid}/docs/reorder` | POST | Studio Owner | Bulk reorder (full ordered ID list) |

Behaviour:

- Mirrors `SectionService` but always sets `software_id` and leaves `project_id` NULL.
- Slug generation uses the same `slugify_title` helper; uniqueness enforced by the partial unique index `uq_sections_software_id_slug`.
- Every mutating call writes a Software Activity Log entry with verb prefix `software_doc_*`.
- Embedding into `section_chunks` reuses the existing section embedding pipeline; the chunk rows carry `section_id`, not `software_id`, and are discriminated in retrieval by joining to `sections`.

### CodebaseService 

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/software/{sid}/codebase/reindex` | POST | Studio Builder+ (owning studio only; cross-studio externals denied) | Create a pending snapshot; index runs in background |
| `/software/{sid}/codebase/snapshots` | GET | Studio Member / Viewer | List snapshots (most recent first) |
| `/software/{sid}/codebase/snapshots/{snapid}` | GET | Studio Member / Viewer | Snapshot detail (file count, chunk count, status, error) |
| `/software/{sid}/codebase/diagnostics` | GET | Tool Admin | `?q=` text → repo-map JSON + top vector hits against current ready snapshot |

Internal methods:

- `create_pending_snapshot(software_id, triggered_by_user_id)` — resolves git config (software override or studio default), inserts pending row, returns it. Caller commits before scheduling the background task; see §11b below.
- `index_snapshot(snapshot_id)` — runs the indexing pipeline (tree walk → blob fetch → tree-sitter chunk → embed → write files/chunks/symbols), respects file/byte caps from settings, marks `superseded` and deletes chunks of the previous ready snapshot on success.
- `get_ready_snapshot(software_id) -> CodebaseSnapshot | None`
- `propose_software_docs_outline(software_id, hint, actor_user_id) -> dict` — composes repo-map context, delegates to `BackpropOutlineAgent`.
- `propose_software_doc_section_draft(software_id, section_id, actor_user_id) -> dict` — composes repo map + retrieved chunks + symbol fallback, delegates to `BackpropSectionAgent`.

### CodebaseRagService 

Internal-only — no endpoints of its own; called by `CodebaseService` and by the code-drift / doc-sync services.

- `retrieve_chunks_for_text(snapshot_id, software_id, query_text, limit) -> list[CodebaseChunkHit]` — embeds the query with `call_source='codebase_rag'`, runs cosine-distance search over `codebase_chunks` scoped to the snapshot. Returns hits with `path`, `chunk_index`, `score`, `snippet` (first 500 chars), `start_line`, `end_line`. Empty list if no ready snapshot or empty query.

### CodebaseRepoMap — (module, not a service class)

`backend/app/services/codebase_repo_map.py` provides:

- `build_repo_map(file_paths, token_budget) -> dict` — current implementation: undirected co-directory graph, NetworkX PageRank, pick top files until token budget is exhausted. Returns `{ "nodes", "ranked_paths", "scores" }`.
- `repo_map_lru(snapshot_id, token_budget, file_paths) -> dict` — in-process LRU keyed by `(snapshot_id, token_budget, sorted_paths_tuple)`; max 64 entries.

**Planned upgrade (separate MR, not in Slice 16):** swap the graph construction to walk `codebase_symbols` references against `codebase_symbols` definitions, weight edges by reference count, and run PageRank over the resulting directed graph. Same signature; downstream agents benefit automatically. Tracked as a follow-up to the §11c repo-map design below.

### CodeDriftService 

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/software/{sid}/codebase/code-drift/run` | POST | Studio Builder+ (owning studio only) | Manual run; synchronous; returns `CodeDriftRunResult` |

Internal methods:

- `run_for_software(software_id, run_actor_id) -> CodeDriftRunResult` — full sweep, bounded (50 sections, 50 work orders); clears prior open auto-issues of kinds `code_drift_section` and `code_drift_work_order` for the software; pre-existing `conflict_or_gap` issues are not touched.

The service also exposes a background-task entry point used by `PublishService` after a successful publish (see Publish hook below).

### DocSyncService 

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/work-orders/{wid}/doc-sync/run` | POST | Studio Builder+ (owning studio only) | Manual run; synchronous; returns `DocSyncRunResult` |

Internal methods:

- `propose_for_work_order(work_order_id, run_actor_id) -> DocSyncRunResult` — picks up to 5 candidate Software Docs sections by relevance, retrieves up to 8 code chunks, delegates to `DocSyncAgent`, validates that every returned proposal targets a real candidate section, inserts `doc_update_suggested` Issues.

The service is also called as a background task from `WorkOrderService` on transition to `Done`.

---

## 5. WebSocket Handlers

### Collaborative Editing (`/ws/projects/{pid}/sections/{sid}/collab`)
- Implements Yjs WebSocket sync protocol
- Receives binary Yjs update messages, broadcasts to all clients on same section
- On connect: sends stored `yjs_state` binary blob to the new client so it can sync from the last persisted state before sending its own pending updates
- Debounce 2s (coalesced) → Postgres: `yjs_state` from pycrdt `get_update()` + `content` from client JSON `markdown_snapshot` on the same socket (never server-side Yjs plaintext extraction for section bodies)
- After write: trigger `DriftService.check_work_order_drift` for all linked work orders
- JWT passed as query param on connect

### Project Chat (`/ws/projects/{pid}/chat`)
- On connect: validate JWT, register in project room
- On user message:
  1. Broadcast user message immediately to all connected clients
  2. Build context via RAGService (call_source = `chat`)
  3. Stream LLM tokens, broadcasting each token to all clients
  4. On complete: persist to `chat_messages`, insert `token_usage`
- On disconnect: unregister from room

### Software Chat (`/ws/software/{sid}/chat`)
- On connect: validate JWT (query param or cookie), resolve software access (`fetch_software_access`); require studio Owner/Builder (`is_studio_editor`); register in software chat room
- On user message:
  1. Broadcast user message immediately to all connected clients
  2. Build system prompt from software definition and project list (software-scoped agent; no project RAG)
  3. Stream LLM tokens, broadcasting each token to all clients
  4. On complete: persist to `software_chat_messages`, insert `token_usage`
- On disconnect: unregister from room (`software_chat_room_registry`)

---

## 6. Frontend Structure

```
frontend/src/
├── main.tsx
├── App.tsx                         # React Router root + auth guard
├── pages/
│   ├── AuthPage.tsx                # Login + Register tabs
│   ├── StudioListPage.tsx          # Grid of studio cards
│   ├── StudioPage.tsx              # Studio dashboard — software list
│   ├── SoftwarePage.tsx            # Software dashboard — projects, SoftwareChatRoom tab, Software Docs
│   ├── ProjectPage.tsx             # Outline + section list + tabs
│   ├── SectionPage.tsx             # Split editor + thread panel
│   ├── WorkOrdersPage.tsx          # Kanban board + list view
│   ├── KnowledgeGraphPage.tsx      # Force-directed graph
│   ├── ChatPage.tsx                # Project chat room
│   ├── IssuesPage.tsx              # Issues panel
│   ├── ArtifactsPage.tsx           # Artifact list + upload
│   ├── TokenUsagePage.tsx          # Token usage dashboard
│   ├── StudioSettingsPage.tsx      # Members, MCP keys, cross-studio requests
│   ├── SoftwareSettingsPage.tsx    # Software definition, git config
│   └── AdminPage.tsx               # Tool Admin: LLM config, cross-studio approvals
├── components/
│   ├── editor/
│   │   ├── SplitEditor.tsx
│   │   └── CollabCursor.tsx
│   ├── chat/
│   │   ├── ChatRoom.tsx            # Project chat room
│   │   ├── SoftwareChatRoom.tsx    # Software-wide chat (WS + history)
│   │   └── ThreadPanel.tsx
│   ├── home/
│   │   └── BuilderHomeComposer.tsx # Studio dashboard — draft → navigate to software chat
│   ├── outline/
│   │   └── OutlineNav.tsx
│   ├── work-orders/
│   │   ├── KanbanBoard.tsx
│   │   ├── WorkOrderCard.tsx
│   │   ├── WorkOrderDetail.tsx
│   │   └── GenerateWorkOrdersModal.tsx
│   ├── graph/
│   │   ├── KnowledgeGraph.tsx      # react-force-graph wrapper
│   │   └── GraphLegend.tsx
│   ├── issues/
│   │   └── IssuesPanel.tsx
│   ├── token-usage/
│   │   └── TokenUsageChart.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Modal.tsx
│       ├── Spinner.tsx
│       ├── Toast.tsx
│       └── Badge.tsx
├── hooks/
│   ├── useYjs.ts
│   ├── useWebSocket.ts
│   ├── useStream.ts
│   ├── useAuth.ts
│   └── useStudioAccess.ts          # Loads GET /studios/{id}/me/capabilities for scoped UI permissions
└── services/
    ├── api.ts
    └── ws.ts
```

---

## 7. RBAC Enforcement

### Backend
Studio-scoped routes resolve membership (and optional context) via FastAPI dependencies in [`backend/app/deps.py`](../backend/app/deps.py). There is no `get_studio_membership` or `require_studio_member` symbol — use the names below.

**Studio routes (`/studios/{studio_id}/...`):**

```python
get_current_user(jwt)
  └── get_studio_access(studio_id)           # StudioAccess: owning-studio member or platform admin; 403 if not a member
        └── require_studio_admin()           # 403 unless Studio Owner (studio_admin) or platform admin
        └── require_studio_editor()          # 403 unless Owner, Builder (studio_member), cross-studio external_editor, or platform admin
```

**Software routes** resolve `Software`, then `resolve_studio_access_for_software`: owning-studio membership **or**, if not a member, an **approved** `cross_studio_access` row for that user’s requesting studio and the target software (`viewer` or `external_editor`). Nested helpers include `get_software_access`, `require_software_editor_in_studio`, `require_software_admin_in_studio`, and project-scoped variants (`get_project_access_nested`, `require_project_member`, etc.).

**Capability flags** for the UI: `GET /studios/{studio_id}/me/capabilities` maps `StudioAccess` to booleans (`is_studio_editor`, `is_studio_viewer`, `is_cross_studio_viewer`, …) in [`backend/app/services/rbac_capabilities_service.py`](../backend/app/services/rbac_capabilities_service.py).

MCP routes have a separate dependency (MCP key `access_level`, not cross-studio):

```python
get_mcp_key(api_key_header)
  └── validate_key_hash()
  └── check_not_revoked()
  └── resolve_studio_scope()
  └── resolve_access_level()   # MCP key: viewer | editor
```

### Frontend
`useStudioAccess` loads the effective permission set via `GET /studios/{studio_id}/me/capabilities` (optional `software_id` query) when a studio is in scope, so UI matches server enforcement. Without a studio id, it derives a conservative set from `/auth/me` for broad navigation. All UI elements (buttons, forms, nav items) are conditionally rendered based on this set — not just hidden but completely absent from the DOM for unauthorised actions.

---

## 8. Real-Time Collaboration (Yjs)

```
Browser A (@milkdown/crepe + y-prosemirror)     Browser B (@milkdown/crepe + y-prosemirror)
        │                                      │
        │   Binary Yjs update messages         │
        │   JSON markdown_snapshot (debounced) │
        ▼                                      ▼
FastAPI WS /collab  ←── broadcast ──────────→ FastAPI WS /collab
        │
        │ Debounced (2s, coalesced)
        ▼
Postgres:
  sections.yjs_state  ← binary (full Yjs doc state)
  sections.content    ← Markdown from markdown_snapshot (RAG / API)
```

- Yjs CRDT in each browser; the section editor uses `@milkdown/crepe` with y-prosemirror (shared type is not legacy `Y.Text` for section bodies).
- Awareness protocol shares cursor position, display name, colour
- Colours assigned deterministically by hashing user ID
- Binary frames relay through pycrdt; JSON `markdown_snapshot` is demuxed in Atelier and never passed to pycrdt.
- **Cold load:** if `yjs_state` is missing or cleared, the server does not seed `Y.Text` from `content`; the client seeds the editor from REST `content` then syncs Yjs.
- **On reconnect:** clients merge Yjs updates from `yjs_state` when present; otherwise they align from REST `content` before sync.

---

## 9. Knowledge Graph — Technical Design

### Data Flow
```
Section saved / Work Order created / Issue detected / Artifact uploaded
        │
        ▼
GraphService.add_edge(...)   ← called by respective service
        │
        ▼
graph_edges table (Postgres)
        │
        ▼
GET /projects/{pid}/graph   ← returns all nodes + edges for the project
        │
        ▼
KnowledgeGraph.tsx (react-force-graph)
```

### Node Construction
The `/graph` endpoint assembles the response:
```python
nodes = [
    { id, type: "section",    label: section.title,       stale: false },
    { id, type: "artifact",   label: artifact.name              },
    { id, type: "work_order", label: work_order.title,    stale: work_order.is_stale },
    { id, type: "issue",      label: issue.description[:50], status: issue.status },
    
]
edges = [
    { source, target, type: "generates" | "involves" | "references" | ... }
]
```

### LLM-Detected Section Relationships
On publish, `GraphService.detect_section_relationships` runs:
1. For each section pair, prompt LLM: "Do these two sections reference or depend on each other? YES/NO + brief reason."
2. Insert `references` edges for YES pairs
3. This is the only expensive graph operation — run on publish, not on every save

### Frontend Rendering
- `react-force-graph-2d` — lightweight, canvas-based, handles hundreds of nodes
- Node colours: Section=blue, Artifact=green, Work Order=orange, Issue=red
- Stale nodes: pulsing orange border
- Conflicted sections: red outline
- Click → navigate to that entity's detail page
- Legend always visible
- Viewer access: graph is fully visible but clicking work orders shows read-only detail

---

## 9b. Codebase Index — Feature Design

The Codebase Index lets Atelier compare the spec to what was actually built, draft Software Docs from existing code, and surface documentation that needs updating after work ships. It is scoped to a **Software** and requires a configured GitLab URL, branch, and token (§6 git config).

### Snapshot Lifecycle

```
POST /software/{sid}/codebase/reindex   (Studio Builder+, owning studio only)
        │
        ▼
CodebaseService.create_pending_snapshot()
  → resolves git config, resolves HEAD commit SHA via GitLab API
  → inserts codebase_snapshots row  (status='pending')
  → session.commit()                 ← row must be visible before background task starts
        │
        ▼
BackgroundTasks.add_task(enqueue_codebase_index, snapshot_id)
        │
        ▼
index_snapshot() in its own async session:
  status = 'indexing'
  fetch repo tree → blob fetch → tree-sitter chunk / line-window fallback
  → codebase_files / codebase_chunks (embed, call_source='codebase_index') / codebase_symbols
  → mark prior 'ready' snapshot 'superseded', DELETE its codebase_chunks rows
  status = 'ready'
  On error: status = 'failed', error_message = str(exc)[:2000]
```

At most one snapshot per Software is ever `ready`. Snapshot rows are retained for audit even after supersession; only their chunk rows are deleted to bound storage.

### Access Control

| Action | Roles permitted |
|---|---|
| Trigger reindex (`POST /reindex`) | Studio Builder or Owner of the **owning** studio; cross-studio Externals denied (`require_software_home_editor`) |
| List / view snapshots | Studio Member or Viewer (any); cross-studio Externals and Viewers with a grant |
| Diagnostics (`GET /diagnostics?q=`) | Tool Admin only |

### RAG Integration

`CodebaseRagService.retrieve_chunks_for_text` embeds the query with `call_source='codebase_rag'`, runs cosine-distance search over `codebase_chunks` (HNSW, `vector_cosine_ops`) scoped to the current ready snapshot. Used by:
- **Code Drift** — per section and per work order during `CodeDriftService.run_for_software`
- **Doc Sync** — per work order during `DocSyncService.propose_for_work_order`
- **Backprop agents** — for Software Docs outline and section draft proposals

### Repo Map

`codebase_repo_map.build_repo_map` builds an undirected co-directory graph over file paths, runs NetworkX PageRank (α=0.85), and returns the top files within a token budget. The result is LRU-cached in-process (max 64 entries, keyed by `(snapshot_id, token_budget, sorted_paths)`). Agents receive the repo map as a newline-separated ranked file list in the user prompt.

### Settings (env, prefix `ATELIER_`)

| Variable | Default | Meaning |
|---|---|---|
| `CODEBASE_INDEX_MAX_FILES` | 50 000 | Hard file count cap per snapshot |
| `CODEBASE_INDEX_MAX_TOTAL_BYTES` | 524 288 000 (500 MB) | Total bytes cap |
| `CODEBASE_INDEX_MAX_FILE_BYTES` | 1 048 576 (1 MB) | Per-file cap; larger files skipped |

### Admin Diagnostics UI

`AdminPage.tsx` includes a **Codebase** tab (`CodebaseSection.tsx`) that lists all software with git configured, shows their current snapshot status (file count, chunk count, symbol count), and exposes a per-software **Reindex** button (calls `POST /software/{sid}/codebase/reindex`). Visible to Tool Admins only.

---

## 10. Work Order Generation (LLM)

```python
async def generate_work_orders(
    section_ids: list[UUID],
    project_id: UUID,
    user_id: UUID
) -> list[WorkOrder]:
```

Prompt pattern:
```
System: {software_definition}

You are a technical project manager. Given the following spec sections, 
decompose the work into discrete, implementable Work Orders. 
Each Work Order must be independently executable by a single developer or coding agent.

For each Work Order output:
- title (short, action-oriented)
- description (what needs to be built, full context)
- implementation_guide (how to approach it, technical notes)
- acceptance_criteria (bullet list of verifiable outcomes)
- linked_section_slugs (which sections this derives from)

Output as JSON array. No preamble.

Sections:
{section_contents}
```

- Response parsed as JSON, each item inserted into `work_orders`
- `work_order_sections` entries created for each `linked_section_slug`
- `graph_edges` entries created: `section → work_order` (type: `generates`)
- Token usage recorded with `call_source = "work_order_gen"`

---

## 11. Drift Detection — Technical Design

```python
async def check_work_order_drift(work_order_id: UUID):
    wo = fetch_work_order(work_order_id)
    sections = fetch_linked_sections(work_order_id)

    prompt = f"""
    Work Order:
    Title: {wo.title}
    Description: {wo.description}
    Acceptance Criteria: {wo.acceptance_criteria}

    Current Spec Sections:
    {format_sections(sections)}

    Has the spec changed significantly enough that this Work Order 
    may now be incorrect or incomplete?
    Answer: YES or NO
    If YES, briefly explain what changed and why it matters.
    """

    response = await llm.chat([{"role": "user", "content": prompt}])

    if response.startswith("YES"):
        update work_orders SET is_stale=true, stale_reason=explanation
        insert token_usage(call_source="drift")
```

- Debounced: fires 5 seconds after the last section save
- Only runs for work orders in `backlog` or `in_progress` status (done orders are not re-checked)
- Cost-aware: uses the smallest/fastest configured model if available (future optimisation)

## 11b — Codebase Indexing Pipeline (Technical Design)

`backend/app/services/codebase_pipeline.py` runs `CodebaseService.index_snapshot` in a background task with its own database session:

```text
create_pending_snapshot(software_id, user_id)
   │
   ▼
session.commit()                              ← row must be visible to the worker
   │
   ▼
BackgroundTasks.add_task(enqueue_codebase_index, snapshot_id)
   │
   ▼
enqueue_codebase_index opens async_session_factory(), then:
   1. resolve software, git config, decrypt git token
   2. set status = 'indexing'
   3. fetch repo tree at the snapshot's commit_sha (GitLab API; never the git binary)
   4. for each blob that survives should_skip_path():
        fetch_blob → decode utf-8 (replace errors) → sanitize embedded base64
        → tree-sitter chunk OR fallback line-window chunk → extract symbols
        → insert codebase_files / codebase_chunks / codebase_symbols rows
        → embed chunks in batches (call_source='codebase_index')
      Honour caps: max_files, max_total_bytes, max_file_bytes (settings).
   5. mark prior ready snapshot for this software as 'superseded' and DELETE
      its codebase_chunks rows; snapshot row kept for audit
   6. set status = 'ready', ready_at = now()
   On any exception: status = 'failed', error_message = str(exc)[:2000]
```

Settings (env, prefix `ATELIER_`):

| Setting | Default | Meaning |
|---|---|---|
| `CODEBASE_INDEX_MAX_FILES` | 50000 | Hard file count cap per snapshot |
| `CODEBASE_INDEX_MAX_TOTAL_BYTES` | 524288000 (500 MB) | Total bytes cap per snapshot |
| `CODEBASE_INDEX_MAX_FILE_BYTES` | 1048576 (1 MB) | Per-file cap; larger files are skipped |

Skipped paths and binary extensions are defined in `code_chunking.py` (`should_skip_path`, `_BINARY_SUFFIXES`). Tree-sitter language map: `_EXT_TO_TS_LANG` in the same module.

---

## 11c — Repo Map (Technical Design)

For each ready snapshot, a per-request repo map is computed from the file path list:

```python
def build_repo_map(file_paths: list[str], token_budget: int) -> dict:
    # 1. Normalise paths (forward slashes, strip leading slash, dedupe).
    # 2. Build an undirected NetworkX graph; one node per file.
    # 3. For each directory group, connect every pair of files inside it.
    # 4. Run nx.pagerank with alpha=0.85.
    # 5. Pick paths in descending PageRank order, accumulating
    #    (len(path) + 24) characters, until token_budget is exhausted.
    # 6. Return { "nodes", "ranked_paths", "scores" }.
```

Cached via `repo_map_lru` keyed by `(snapshot_id, token_budget, sorted_paths)`. The cache is in-process (max 64 entries) and reset on process restart.

The agents in §11d / §11e / §11f consume the repo map by formatting `ranked_paths` as a newline-separated list (top 60 paths typically), prefixed by a short header in the user prompt.

---

## 11d — Backprop Agents (Technical Design)

Two structured agents under `backend/app/agents/`:

### `backprop_outline_agent.py`

- `SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + "...{sw_name}...{def_block}..."`
- `USER_PROMPT` placeholders: `{repo_map_blob}`, `{hint}`.
- `BACKPROP_OUTLINE_JSON_SCHEMA` returns `{ sections: [ { title, slug, summary } ] }`.
- `call_source='backprop_outline'`.
- Validation: slugs must match the slug regex used by `SoftwareDocsSectionService`. Invalid slugs are slugified by the service on accept, never rejected at the agent layer.

### `backprop_section_agent.py`

- `SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + "...{sw_name}...{def_block}..."`
- `USER_PROMPT` placeholders: `{section_title}`, `{section_summary}`, `{repo_map_blob}`, `{code_chunks_blob}`.
- `BACKPROP_SECTION_JSON_SCHEMA` returns `{ markdown: str, source_files: [str] }`.
- `call_source='backprop_section'`.
- Orchestration in `CodebaseService.propose_software_doc_section_draft`:
  1. Build repo map at `token_budget=1500`.
  2. Retrieve top 10 code chunks via `CodebaseRagService.retrieve_chunks_for_text(query_text = title + ' ' + content[:1500])`.
  3. **Fallback:** if hits < 3, additionally query `codebase_symbols` by case-insensitive `name LIKE` on title tokens, limit 20. Add these file paths as bare path lines (no snippet) to the chunks blob. Document this in the agent docstring.

---

## 11e — Code Drift Agents (Technical Design)

Two structured agents under `backend/app/agents/`:

### `code_drift_section_agent.py`

- `SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + "..."` — conservative bar: flag only divergences a careful reader would call out.
- `USER_PROMPT` placeholders: `{section_title}`, `{section_body}`, `{repo_map_blob}`, `{code_chunks_blob}`.
- `CODE_DRIFT_SECTION_JSON_SCHEMA` returns `{ likely_drifted: bool, severity: "low"|"medium"|"high", reason: str, code_refs: [{ path, start_line, end_line }] }`.
- `call_source='code_drift_section'`.

### `code_drift_work_order_agent.py`

- `SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + "..."` — conservative bar: `partial` is the default when uncertain.
- `USER_PROMPT` placeholders: `{wo_title}`, `{wo_description}`, `{wo_acceptance_criteria}`, `{repo_map_blob}`, `{code_chunks_blob}`.
- `CODE_DRIFT_WO_JSON_SCHEMA` returns `{ verdict: "complete"|"partial"|"missing", reason: str, code_refs: [...] }`.
- `call_source='code_drift_work_order'`.

`CodeDriftService.run_for_software` flow:

```text
ensure_openai_llm_ready(call_source='code_drift_section')   ← skip run on ApiError
       │
       ▼
clear open auto-issues where kind IN ('code_drift_section','code_drift_work_order')
                                AND software_id = sid
       │
       ▼
sections = SoftwareDocs(sid) ∪ ProjectSections(sid, not_archived)
           ordered by updated_at desc, limit 50
work_orders = WorkOrders(sid, status IN (backlog,in_progress,in_review),
                              not_archived)
              ordered by updated_at desc, limit 50
       │
       ▼
repo_map = repo_map_lru(snapshot_id, budget=1200, file_paths)
       │
       ▼
for s in sections:
    chunks = CodebaseRagService.retrieve_chunks_for_text(
                snapshot_id, sid, query=s.title + ' ' + s.content[:800], limit=8)
    out = CodeDriftSectionAgent.analyse(...)
    if out.likely_drifted:
        insert Issue(kind='code_drift_section',
                     software_id=sid,
                     project_id=s.project_id,                ← may be NULL for Software Docs
                     section_a_id=s.id,
                     description=out.reason[:2000],
                     origin='auto', run_actor_id=actor,
                     payload_json={severity, code_refs})

for w in work_orders:
    chunks = CodebaseRagService.retrieve_chunks_for_text(
                snapshot_id, sid,
                query=w.title + ' ' + w.description + ' ' + w.acceptance_criteria[:400],
                limit=8)
    out = CodeDriftWorkOrderAgent.analyse(...)
    if out.verdict != 'complete':
        insert Issue(kind='code_drift_work_order',
                     software_id=sid, project_id=w.project_id,
                     work_order_id=w.id,
                     description=out.reason[:2000],
                     origin='auto', run_actor_id=actor,
                     payload_json={verdict, code_refs})
```

Cost-aware: a single `repo_map_lru` lookup is reused across all sections and work orders in a run. Token usage is recorded under `call_source='code_drift_section'` and `'code_drift_work_order'` against the software's owning studio.

---

## 11f — Documentation Sync (Technical Design)

One structured agent under `backend/app/agents/`:

### `doc_sync_agent.py`

- `SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + "..."` — conservative bar: propose a change only when the work clearly changes what the documentation should say; preserve the section's voice and structure.
- `USER_PROMPT` placeholders: `{wo_title}`, `{wo_description}`, `{wo_acceptance_criteria}`, `{candidate_sections_blob}`, `{code_chunks_blob}`.
- `DOC_SYNC_JSON_SCHEMA` returns `{ proposals: [ { section_id: str, rationale: str, replacement_markdown: str } ] }`. The agent may return zero proposals.
- `call_source='doc_sync'`.

`DocSyncService.propose_for_work_order` flow:

```text
resolve work_order → project → software → studio
                                       │
                                       ▼
ready = CodebaseService.get_ready_snapshot(software.id)
if ready is None: return skipped_reason='not_indexed'

candidates = SoftwareDocs(software.id) ranked by similarity
             to (wo.description + wo.acceptance_criteria), top 5
                                       │
                                       ▼
chunks = CodebaseRagService.retrieve_chunks_for_text(
            ready.id, software.id,
            query=wo.title + ' ' + wo.description, limit=8)
                                       │
                                       ▼
out = DocSyncAgent.propose_patches(...)
for p in out.proposals:
    if p.section_id ∉ {c.id for c in candidates}:
        log warning; drop                              ← defensive: agent should not invent IDs
        continue
    insert Issue(kind='doc_update_suggested',
                 software_id=software.id,
                 project_id=NULL,
                 section_a_id=p.section_id,
                 work_order_id=wo.id,
                 description=p.rationale[:2000],
                 origin='auto', run_actor_id=actor,
                 payload_json={replacement_markdown: p.replacement_markdown})
```

Apply flow:

```text
user clicks Apply → frontend navigates to Software Docs editor for section_a_id
                  + sets the Yjs document's pending state to replacement_markdown
                  (DOES NOT save)
                  │
                  ▼
user saves explicitly
                  │
                  ▼
existing section save path runs (debounced persistence + re-embed)
                  │
                  ▼
issue resolution endpoint called with reason='applied';
issue.status = 'resolved', resolution_reason = 'applied'
```

Dismiss flow:

```text
user clicks Dismiss → existing issue resolution endpoint with reason='dismissed';
                      issue.status = 'resolved', resolution_reason = 'dismissed'
```

---

## 12. Streaming LLM Responses

### Private Thread (SSE)
```
POST /projects/{pid}/sections/{sid}/thread/messages
  JSON: { content, current_section_plaintext?, include_git_history?,
          selected_plaintext?, include_selection_in_context?, thread_intent?,
          command?, preferred_model? }
        │
        ▼
RAGService.build_context(query, project_id, section_id,
    current_section_plaintext_override?, include_git_history?)
        │
        ▼
LLMService.chat_stream() + TokenTracker
        │
   text/event-stream (type: token — main reply, then optional token chunks for
   "Conflicts and gaps" appendix; type: meta — findings[], conflicts[],
   context_truncated, patch_proposal?)
        │
        ▼
ThreadPanel.tsx — useStream() → streamPrivateThreadReply → privateThreadSse.consumePrivateThreadSseBody
→ tokens appended live to assistant bubble; persisted assistant message includes appendix;
  patch_proposal (if any) is shown with preview; Apply writes to Yjs only after user confirmation
```

`thread_intent` defaults to `ask` (chat only). For `append` | `replace_selection` | `edit`, the server runs an additional structured LLM call after the main reply and attaches the result as `patch_proposal` on the final `meta` event. When `selected_plaintext` is sent, it is validated against the same plaintext snapshot used for RAG (substring match; for `replace_selection`, the excerpt must appear exactly once in that snapshot). `replace_selection` requires `current_section_plaintext` and `selected_plaintext`; selection bounds are validated by snapshot match, not offsets.

### Project Chat (WebSocket broadcast)
```
WS message from User A
        │
        ▼
RAGService.build_context()
        │
        ▼
LLMService.chat_stream() + TokenTracker
        │ (each token)
        ▼
Broadcast to ALL connected clients in project room
→ all participants see tokens appear simultaneously
```

---

## 13. Deployment (Docker Compose)

### Services
```yaml
services:
  frontend:
    build: ./frontend
    ports: ["3000:80"]           # Nginx serving React build

  backend:
    build: ./backend
    ports: ["8000:8000"]         # Uvicorn
    depends_on: [db, storage]
    environment:
      - DATABASE_URL
      - JWT_SECRET
      - ENCRYPTION_KEY
      - MINIO_ENDPOINT
      - MINIO_ROOT_USER
      - MINIO_ROOT_PASSWORD

  db:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    environment:
      - POSTGRES_USER
      - POSTGRES_PASSWORD
      - POSTGRES_DB

  storage:
    image: minio/minio
    ports: ["9000:9000", "9001:9001"]
    volumes: [minio_data:/data]
    command: server /data --console-address ":9001"
```

### Environment Variables (`.env`)
```
# Postgres
POSTGRES_USER=atelier
POSTGRES_PASSWORD=atelier
POSTGRES_DB=atelier
DATABASE_URL=postgresql+asyncpg://atelier:atelier@db/atelier

# MinIO
MINIO_ROOT_USER=atelier
MINIO_ROOT_PASSWORD=atelier
MINIO_ENDPOINT=storage:9000
MINIO_BUCKET=atelier-artifacts

# Auth
JWT_SECRET=changeme-use-a-long-random-string
JWT_EXPIRE_MINUTES=10080

# Encryption (git tokens + MCP keys at rest)
ENCRYPTION_KEY=changeme-32-byte-fernet-key
```

### Compose Profiles
- `docker-compose.dev.yml` — hot reload (uvicorn `--reload`, Vite dev server), verbose logging
- `docker-compose.prod.yml` — optimised builds, Nginx, health checks, resource limits, restart policies

---

## 14. Security

| Concern | Approach |
|---|---|
| Password storage | bcrypt, never stored plain |
| JWT | HS256, configurable expiry |
| Studio isolation | `studio_id` scoping enforced on every query via FastAPI dependency chain |
| Chinese wall | Cross-studio data access requires explicit `cross_studio_access` record with Tool Admin approval |
| Owner-only actions | Explicit role check in route handler, not just middleware |
| Git token storage | Fernet symmetric encryption at rest |
| MCP key storage | bcrypt hash only — raw key shown once on generation |
| MCP scope isolation | MCP keys scoped to studio; enforced in MCP dependency chain |
| File type validation | Magic bytes check on upload |
| Auth rate limiting | Slowdown middleware on `/auth/login` and `/auth/register` |
| CORS | Strict origin allowlist |
| WebSocket auth | JWT as query param, validated on connect |

---

## 15. Implementation Slices

### Slice 1 — Foundation
- Monorepo scaffold, Docker Compose, all Alembic migrations (full schema from day one)
- FastAPI skeleton: CORS, JWT middleware, structured error handling, structured logging
- Auth endpoints + Tool Admin bootstrap
- Admin config endpoint + seeding
- React scaffold: React Router, Tailwind, API client, JWT storage
- Login + Register pages

### Slice 2 — Studios & Software
- Studio CRUD + member management endpoints + frontend
- Studio Owner / Studio Builder role enforcement
- Software CRUD + Software Definition editor
- Git config + test connection
- Studio list page, Studio page, Software page

### Slice 3 — Projects & Outline
- Project CRUD endpoints + frontend
- Section CRUD (create, list, reorder, delete)
- Outline nav with drag-and-drop
- Project page with section navigation

### Slice 4 — Spec Editor
- CodeMirror 6 split-view editor (source + preview)
- Yjs real-time co-editing via WebSocket
- Collaborator cursors
- Debounced persistence to Postgres
- Section page

### Slice 5 — Artifacts
- File upload to MinIO (PDF + MD)
- Artifact listing + download
- Async chunking + embedding pipeline
- Section content re-embedding on save
- In-tool MD artifact creator

### Slice 6 — LLM & RAG
- LLMService + TokenTracker (every call recorded)
- RAGService (smart context assembly, pgvector search; optional live `current_section_plaintext` override; optional GitLab commit list when `include_git_history` is true)
- Private thread endpoints with SSE streaming; post-reply structured scan for conflicts and gaps (appended to stored assistant content and streamed as trailing tokens); optional selection-in-context and `thread_intent` with structured `patch_proposal` on `meta` (confirm-before-apply in ThreadPanel)
- ThreadPanel sidebar (`useStream` hook + shared SSE parser in `privateThreadSse.ts`)

### Slice 7 — Work Orders
- Work Order CRUD endpoints
- LLM auto-generation from sections
- Kanban board + list view frontend
- Phase drag-and-drop sequencing
- Work Order detail page with notes

### Slice 8 — Drift Detection
- DriftService triggered after every section save (debounced)
- Stale flag on work order cards and board
- Dismiss stale flow with audit log

### Slice 9 — Knowledge Graph
- `graph_edges` table + GraphService
- Edge creation wired into all relevant services (work order gen, artifact upload, issue detection)
- `/graph` endpoint
- KnowledgeGraph.tsx with react-force-graph-2d
- LLM-detected section relationships on publish

### Slice 10 — Project Chat
- WebSocket chat room
- Real-time broadcast + LLM streaming to all clients
- Paginated chat history
- ChatRoom frontend component

### Slice 11 — Publish, Git & Conflict Detection
- ConflictService (section pair + single section analysis)
- GitService (self-hosted GitLab API only)
- PublishService (compile MD + work orders, commit, trigger analysis + drift)
- Publish modal + commit history timeline
- Issues panel frontend

### Slice 12 — MCP Server
- MCP key generation + management (Studio Owner)
- MCP endpoints: list, pull, update, note
- Full context assembly on work order pull
- MCP key management UI in Studio Settings
- Token usage recording for MCP calls

### Slice 13 — Cross-Studio Access
- Cross-studio access request flow (Studio Owner → Tool Admin approval)
- Tool Admin approval UI
- Viewer permission enforcement across all routes + frontend
- Knowledge Graph + Work Orders read-only for Viewers

### Slice 14 — Token Usage Dashboard
- Token usage recording wired into all LLM + MCP calls
- Token usage endpoints (Tool Admin all-studio, Studio Owner studio, Member self)
- Token usage dashboard with charts + CSV export

### Slice 15 — Polish & Hardening
- Empty states, loading skeletons, error boundaries, toast notifications
- Global structured error handler
- LLM / MinIO / Git provider error handling
- Security hardening (rate limiting, file validation, key encryption)
- Docker Compose production hardening
- Documentation (README, configuration guide, admin setup, architecture)

### Slice 16 — Codebase Analyst & Software Docs

#### Slice 16a — Software Docs (software-scoped outline)
- `sections` schema migration (nullable `project_id`, new `software_id`, mutual-exclusion CHECK, partial unique indexes)
- `SoftwareDocsSectionService` + endpoints under `/software/{sid}/docs`
- Activity log verbs `software_doc_*`
- Yjs collab room path `/ws/software/{sfid}/docs/{sid}/collab`
- `RAGService` updated: Software Docs outline block between Software Definition and Project outline
- `PublishService` writes docs files at `<repo_root>/docs/<slug>.md` plus `<repo_root>/docs/README.md` on every project publish
- Knowledge Graph node type `Software Doc Section`
- `SoftwareDocsPage` + `SoftwareDocSectionPage` (CodeMirror + Yjs editor reused)
- Conflict / gap detection runs as a separate pair-set per software for software-doc sections (does not mix with project sections)

#### Slice 16b — Codebase snapshot infrastructure
- `codebase_snapshots`, `codebase_files`, `codebase_chunks`, `codebase_symbols` table migrations (HNSW on chunks)
- `tree-sitter-languages` dependency
- `code_chunking.py` (tree-sitter chunker + line-window fallback, `should_skip_path`, binary suffix list, base64 sanitiser)
- `git_service` additions: `list_repo_tree`, `fetch_blob`, `list_commits`
- `CodebaseService.create_pending_snapshot` + `index_snapshot` + background task pipeline (`codebase_pipeline.py`)
- `/software/{sid}/codebase/reindex` + `/snapshots` endpoints
- Codebase panel on `SoftwareSettingsPage` with snapshot history + Reindex button
- Settings caps wired to `Settings`

#### Slice 16c — Codebase RAG + repo map
- `CodebaseRagService.retrieve_chunks_for_text`
- `codebase_repo_map.build_repo_map` (NetworkX, co-directory PageRank) + `repo_map_lru` cache
- `/software/{sid}/codebase/diagnostics` (Tool Admin)
- No user-facing UI in this slice

#### Slice 16d — Backprop agents
- `backprop_outline_agent.py` + `backprop_section_agent.py`
- `CodebaseService.propose_software_docs_outline` + `propose_software_doc_section_draft` (with `codebase_symbols` name-match fallback)
- `/software/{sid}/docs/propose-outline` + `/{secid}/propose-draft`
- "Draft outline from codebase" modal on `SoftwareDocsPage` (Studio Owner)
- "Draft from codebase" diff modal on `SoftwareDocSectionPage` (Studio Builder+)
- Agent registry update in `.cursor/rules/agents.mdc`

#### Slice 16e — Code drift agents
- `issues` schema migration (`kind`, nullable `project_id`, `software_id`, `work_order_id`, `payload_json`, `resolution_reason`, indexes)
- `code_drift_section_agent.py` + `code_drift_work_order_agent.py`
- `CodeDriftService.run_for_software`
- `/software/{sid}/codebase/code-drift/run` endpoint
- `PublishService` hook to schedule drift run as background task after publish
- Issues Panel rendering for new issue kinds, including software-scoped issues alongside project-scoped
- Graph edges: `drifts_from_code` (Section → Issue, Work Order → Issue)
- Agent registry update in `.cursor/rules/agents.mdc`

#### Slice 16f — Doc sync agent
- `doc_sync_agent.py`
- `DocSyncService.propose_for_work_order`
- `WorkOrderService` hook on transition to `Done` to schedule background sync
- `/work-orders/{wid}/doc-sync/run` endpoint
- Issues Panel rendering for `doc_update_suggested` with side-by-side diff and Apply / Apply with edits / Dismiss
- Section save path resolves the Issue with `resolution_reason='applied'` when Apply was the navigation source
- Graph edge: `suggests_doc_update` (Work Order → Issue)
- Future Scope updates in functional requirements doc (§20)
- Agent registry update in `.cursor/rules/agents.mdc`

**Slice 16 — LLM `call_source` values (token usage dashboard):**

| `call_source` | Agent / entrypoint |
|---|---|
| `backprop_outline` | `BackpropOutlineAgent.propose_outline` |
| `backprop_section` | `BackpropSectionAgent.propose_section_draft` |
| `code_drift_section` | `CodeDriftSectionAgent.analyse` |
| `code_drift_work_order` | `CodeDriftWorkOrderAgent.analyse` |
| `doc_sync` | `DocSyncAgent.propose_patches` |


---

## 16. Full API Reference

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register + JWT |
| POST | `/auth/login` | Public | Login + JWT |
| GET | `/auth/me` | JWT | Current user |

### Admin (Tool Admin only)
| Method | Path | Description |
|---|---|---|
| POST | `/admin/test/embedding` | Embedding connectivity probe (registry + embeddings routing) |
| GET/PUT | `/admin/config` | **Not registered** (default **404**; removed); use Admin Console → LLM |
| GET | `/admin/cross-studio` | **Not registered** (default **404**; removed); use studio `…/cross-studio-incoming…` |
| PUT | `/admin/cross-studio/{id}` | **Not registered** (default **404**; removed; same) |
| GET | `/admin/token-usage` | **Not registered** (default **404**; removed); use `/studios/{id}/token-usage` or `/me/token-usage` |
| GET/POST | `/admin/users` | User directory / create |
| PUT | `/admin/users/{id}/admin-status` | Platform admin toggle |

### Studios
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/studios` | JWT | Create studio |
| GET | `/studios` | JWT | List my studios |
| GET/PUT | `/studios/{id}` | Member/Admin | Detail / update |
| GET/POST/DELETE | `/studios/{id}/members[/{uid}]` | Admin | Member management |
| PUT | `/studios/{id}/members/{uid}/role` | Admin | Change role |
| POST | `/studios/{id}/cross-studio-request` | Admin | Request cross-studio access |
| GET | `/studios/{id}/token-usage` | Admin | Studio usage |
| GET/POST/DELETE | `/studios/{id}/mcp-keys[/{kid}]` | Admin | MCP key management |

### Software
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/studios/{id}/software` | Studio Owner | Create software |
| GET | `/studios/{id}/software` | Member/Viewer | List software |
| GET/PUT/DELETE | `/studios/{id}/software/{sid}` | Member/Admin | Detail / update / delete |
| POST | `/studios/{id}/software/{sid}/git-test` | Admin | Test git connection |

### Projects
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/software/{sid}/projects` | Member | Create project |
| GET | `/software/{sid}/projects` | Member/Viewer | List projects |
| GET/PUT/DELETE | `/software/{sid}/projects/{pid}` | Member/Admin | Detail / update / delete |

### Sections
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/projects/{pid}/sections` | Studio Owner | Create section |
| GET | `/projects/{pid}/sections` | Member/Viewer | List sections |
| GET/PUT/DELETE | `/projects/{pid}/sections/{sid}` | Member/Admin | Detail / update / delete |

### Artifacts
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/projects/{pid}/artifacts` | Member | Upload (project scope) |
| GET | `/projects/{pid}/artifacts` | Member/Viewer | List project-scoped files |
| GET | `/projects/{pid}/artifacts/{aid}/download` | Member/Viewer | Download |
| DELETE | `/projects/{pid}/artifacts/{aid}` | Member | Delete |
| POST | `/studios/{sid}/artifacts` | Owner or Builder | Upload (studio library) |
| POST | `/studios/{sid}/artifacts/md` | Owner or Builder | Create Markdown (studio library) |
| GET | `/studios/{sid}/artifact-library` | Member/Viewer | Unified library (`?softwareId=` optional) |
| POST | `/software/{swid}/artifacts` | Software editor | Upload (software library) |
| POST | `/software/{swid}/artifacts/md` | Software editor | Create Markdown (software library) |
| GET | `/artifacts/{aid}/download` | Authorized reader | Download (all scopes) |

### Work Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/projects/{pid}/work-orders` | Member | Create |
| POST | `/projects/{pid}/work-orders/generate` | Member | LLM auto-generate |
| GET | `/projects/{pid}/work-orders` | Member/Viewer | List (filterable) |
| GET/PUT/DELETE | `/projects/{pid}/work-orders/{wid}` | Member/Viewer | Detail / update / delete |
| POST | `/projects/{pid}/work-orders/{wid}/dismiss-stale` | Member | Dismiss stale |
| POST | `/projects/{pid}/work-orders/{wid}/notes` | Member | Add note |

### Threads & Chat
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/{pid}/sections/{sid}/thread` | Member | Get thread + history |
| POST | `/projects/{pid}/sections/{sid}/thread/messages` | Member | Send message (SSE) |
| GET | `/projects/{pid}/chat` | Member | Project chat history |
| GET | `/software/{sid}/chat` | Member | Software chat history |

### Graph
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/{pid}/graph` | Member/Viewer | Nodes + edges |

### Publish, Git & Issues
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/projects/{pid}/publish` | Member | Publish to git |
| GET | `/software/{sid}/history` | Member/Viewer | Commit history |
| POST | `/projects/{pid}/analyze` | Member | Manual conflict analysis |
| GET | `/projects/{pid}/issues` | Member (filtered) | List issues |
| PUT | `/projects/{pid}/issues/{iid}` | Member | Update status |

### Token Usage
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/token-usage` | Tool Admin | **Not registered** (default **404**; removed); no all-studios aggregate route |
| GET | `/studios/{id}/token-usage` | Studio Owner | Own studio aggregate |
| GET | `/me/token-usage` | Member | Own usage (Builder, External, Studio Owner) |

**Token usage visibility by role** (FR §4.3):
- **Tool Admin** — full visibility across all studios via the dashboard (reads all `token_usage` rows by studio).
- **Studio Owner** — `GET /studios/{id}/token-usage` for their own studio.
- **Studio Builder / cross-studio External** — `GET /me/token-usage` for their own calls only.
- **Studio Viewer / cross-studio Viewer** — no token usage access; `GET /me/token-usage` returns 403 for these roles.

### Notifications
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me/notifications` | JWT | Paginated inbox (cursor-based) |
| PATCH | `/me/notifications/{nid}` | JWT | Mark individual notification read/unread |
| POST | `/me/notifications/mark-all-read` | JWT | Mark all as read |
| POST | `/admin/jobs/stale-draft-notifications` | Tool Admin | Manually trigger the stale-draft notification sweep (equivalent to the daily job) |

**Stale-draft notification job** — the `draft_unpublished` kind is written by a background job (`draft_unpublished_notification_job`), not by `NotificationDispatchService`. Enable the daily sweep at application startup with `ATELIER_STALE_DRAFT_NOTIFIER=1`. Platform administrators can trigger it on demand via `POST /admin/jobs/stale-draft-notifications`.

### MCP Server
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mcp/v1/work-orders` | MCP Key | List work orders |
| GET | `/mcp/v1/work-orders/{wid}` | MCP Key | Pull with full context |
| PATCH | `/mcp/v1/work-orders/{wid}` | MCP Key (editor) | Update status |
| POST | `/mcp/v1/work-orders/{wid}/notes` | MCP Key (editor) | Post note |

### WebSockets
| Path | Auth | Description |
|---|---|---|
| `/ws/projects/{pid}/sections/{sid}/collab` | JWT query param | Yjs co-editing |
| `/ws/projects/{pid}/chat` | JWT query param | Project chat room |
| `/ws/software/{sid}/chat` | JWT query param or cookie | Software-wide chat room |


---

## 17. Testing Strategy (TDD)

Atelier is built test-first. Every service, route, and component has tests written **before** implementation. The test suite is the specification for the code.

### Software Docs

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/software/{sid}/docs` | Studio Owner | Create section |
| GET | `/software/{sid}/docs` | Member / Viewer / granted External | List sections |
| GET | `/software/{sid}/docs/{secid}` | Member / Viewer / granted External | Get one |
| PATCH | `/software/{sid}/docs/{secid}` | Studio Builder+ (content); Owner (structure) | Update |
| DELETE | `/software/{sid}/docs/{secid}` | Studio Owner | Delete |
| POST | `/software/{sid}/docs/reorder` | Studio Owner | Bulk reorder |

### Codebase Index

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/software/{sid}/codebase/reindex` | Studio Builder+ (owning studio) | Trigger snapshot |
| GET | `/software/{sid}/codebase/snapshots` | Studio Member / Viewer | List snapshots |
| GET | `/software/{sid}/codebase/snapshots/{snapid}` | Studio Member / Viewer | Snapshot detail |
| GET | `/software/{sid}/codebase/diagnostics` | Tool Admin | Repo map + vector hits for `?q=` |

### Backprop

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/software/{sid}/docs/propose-outline` | Studio Owner | Backprop outline proposal |
| POST | `/software/{sid}/docs/{secid}/propose-draft` | Studio Builder+ | Backprop section draft |

### Code Drift

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/software/{sid}/codebase/code-drift/run` | Studio Builder+ | Manual run |

### Doc Sync

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/work-orders/{wid}/doc-sync/run` | Studio Builder+ | Manual run for one Work Order |


---

### 17.1 Philosophy

- **Red → Green → Refactor** on every feature, no exceptions
- Tests are written in the same PR/commit as the feature — never after
- A failing test is the entry point to every new slice
- LLM-dependent tests use real API calls and are tagged `@pytest.mark.llm` so they can be excluded from fast CI runs and included in full nightly/pre-release runs
- Coverage target: **≥ 90% line coverage** on backend services; **≥ 80%** on frontend components

---

### 17.2 Test Levels

| Level | Scope | Tools | Speed | Runs in CI |
|---|---|---|---|---|
| **Unit** | Single function / component in isolation | pytest / Jest + RTL | Fast (<1s each) | Every push |
| **Integration** | Multiple components + real DB + real HTTP | pytest + httpx + Docker Postgres | Medium (1–5s each) | Every push |
| **E2E** | Full browser flow, real backend + DB | Playwright | Slow (5–30s each) | Every PR merge |
| **LLM** | Real LLM API calls for prompt regression | pytest + real provider | Slow + costs tokens | Nightly / pre-release |

---

### 17.3 Backend Testing Setup

#### Dependencies (`requirements-test.txt`)
```
pytest
pytest-asyncio
pytest-cov
pytest-mark-parametrize
httpx
anyio
factory-boy          # test data factories
faker                # realistic fake data
respx                # mock external HTTP calls (GitLab API, MinIO)
```

#### Test Database
- A dedicated Postgres 16 + pgvector container is spun up via `docker-compose.test.yml`
- Each test session runs `alembic upgrade head` against the test DB on startup
- Each test function wraps its DB operations in a transaction that is **rolled back** after the test — no cleanup needed, no state leakage between tests
- The test DB URL is injected via `TEST_DATABASE_URL` env var

```yaml
# docker-compose.test.yml
services:
  db_test:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: atelier_test
      POSTGRES_PASSWORD: atelier_test
      POSTGRES_DB: atelier_test
    ports: ["5433:5432"]   # different port to avoid conflict with dev DB
```

#### Fixtures (`conftest.py`)
```python
@pytest.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(run_migrations)
    yield engine
    await engine.dispose()

@pytest.fixture
async def db_session(db_engine):
    async with db_engine.begin() as conn:
        session = AsyncSession(bind=conn)
        yield session
        await conn.rollback()   # rolls back after every test

@pytest.fixture
async def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c

@pytest.fixture
async def studio_admin(client, db_session):
    # Creates a user + studio + returns auth headers
    ...

@pytest.fixture
async def studio_member(client, db_session, studio_admin):
    # Creates a member user in the same studio
    ...

@pytest.fixture
async def viewer(client, db_session):
    # Creates a cross-studio viewer
    ...
```

#### Test Factories (`tests/factories.py`)
```python
class UserFactory(AsyncSQLAlchemyModelFactory):
    class Meta:
        model = User
    email = factory.LazyAttribute(lambda _: faker.email())
    display_name = factory.LazyAttribute(lambda _: faker.name())
    password_hash = bcrypt.hash("testpassword")

class StudioFactory(AsyncSQLAlchemyModelFactory): ...
class SoftwareFactory(AsyncSQLAlchemyModelFactory): ...
class ProjectFactory(AsyncSQLAlchemyModelFactory): ...
class SectionFactory(AsyncSQLAlchemyModelFactory): ...
class WorkOrderFactory(AsyncSQLAlchemyModelFactory): ...
```

#### File Layout
```
backend/
├── tests/
│   ├── conftest.py             # shared fixtures
│   ├── factories.py            # factory-boy model factories
│   ├── unit/
│   │   ├── services/
│   │   │   ├── test_rag_service.py
│   │   │   ├── test_drift_service.py
│   │   │   ├── test_conflict_service.py
│   │   │   ├── test_graph_service.py
│   │   │   ├── test_publish_service.py
│   │   │   └── test_git_service.py
│   │   └── utils/
│   │       ├── test_token_tracker.py
│   │       └── test_rbac.py
│   ├── integration/
│   │   ├── test_auth.py
│   │   ├── test_studios.py
│   │   ├── test_software.py
│   │   ├── test_projects.py
│   │   ├── test_sections.py
│   │   ├── test_artifacts.py
│   │   ├── test_work_orders.py
│   │   ├── test_threads.py
│   │   ├── test_chat.py
│   │   ├── test_publish.py
│   │   ├── test_issues.py
│   │   ├── test_graph.py
│   │   ├── test_mcp.py
│   │   ├── test_cross_studio.py
│   │   └── test_token_usage.py
│   └── llm/                    # @pytest.mark.llm — real API calls
│       ├── test_work_order_generation.py
│       ├── test_conflict_detection.py
│       ├── test_drift_detection.py
│       └── test_rag_context_assembly.py
```

---

### 17.4 What Each Test Level Covers (Backend)

#### Unit Tests
Pure logic tests — no DB, no HTTP, no LLM. External dependencies are mocked.

| File | What it tests |
|---|---|
| `test_rag_service.py` | Context assembly logic: token budget enforcement, relevance ranking, section ordering, artifact chunk selection |
| `test_drift_service.py` | Prompt construction, YES/NO parsing, stale flag logic (LLM mocked with deterministic responses) |
| `test_conflict_service.py` | Section pair selection, issue deduplication logic, auto-clear of previous issues |
| `test_graph_service.py` | Edge creation, edge deduplication, node construction for API response |
| `test_publish_service.py` | MD file compilation, README generation, work order export format |
| `test_git_service.py` | GitLab API call construction — commit, get history, error handling (respx mocks HTTP calls) |
| `test_token_tracker.py` | Token counting, cost estimation, call type tagging |
| `test_rbac.py` | Permission matrix — every role × every action combination |

#### Integration Tests
Hit the real test database via the rolled-back transaction fixture. Use `httpx.AsyncClient` against the live FastAPI app.

Example: `test_work_orders.py`
```python
async def test_auto_generate_work_orders(client, studio_member, project_with_sections):
    # ARRANGE — section with content already exists (via fixture)
    section_id = project_with_sections["sections"][0]["id"]

    # ACT
    response = await client.post(
        f"/projects/{project_with_sections['id']}/work-orders/generate",
        json={"section_ids": [section_id]},
        headers=studio_member["headers"]
    )

    # ASSERT
    assert response.status_code == 201
    work_orders = response.json()
    assert len(work_orders) >= 1
    assert work_orders[0]["title"]
    assert work_orders[0]["acceptance_criteria"]
    assert work_orders[0]["status"] == "backlog"
    # Verify graph edges were created
    graph = await client.get(f"/projects/{project_with_sections['id']}/graph", ...)
    edges = graph.json()["edges"]
    assert any(e["edge_type"] == "generates" for e in edges)

async def test_viewer_cannot_create_work_order(client, viewer, project):
    response = await client.post(
        f"/projects/{project['id']}/work-orders",
        json={"title": "Test", "description": "Test"},
        headers=viewer["headers"]
    )
    assert response.status_code == 403

async def test_stale_flag_set_on_section_update(client, studio_member, work_order_with_section):
    # Update the linked section content significantly
    await client.put(
        f"/projects/{work_order_with_section['project_id']}/sections/{work_order_with_section['section_id']}",
        json={"content": "Completely different content that contradicts the work order"},
        headers=studio_member["headers"]
    )
    # Wait for debounced drift check
    await asyncio.sleep(6)
    wo = await client.get(f"/projects/.../work-orders/{work_order_with_section['id']}", ...)
    assert wo.json()["is_stale"] is True
```

Key integration test patterns for every route group:
- Happy path (correct role, valid data → expected response + DB state)
- Auth missing → 401
- Wrong role → 403
- Chinese wall violation (cross-studio without access) → 403
- Invalid data → 422
- Not found → 404
- Cascade deletes (delete studio → verify all children gone)

#### Validation error codes (selected)

| Code | HTTP | When |
|------|------|------|
| `SECTION_REQUIRED` | 422 | Work order create/update would leave no linked spec sections (e.g. `section_ids: []` on update). |

#### LLM Tests (`@pytest.mark.llm`)
Real API calls against the configured provider. Slow, tagged, run only in full suite.

Because all structured calls use `LLMService.chat_structured` with enforced JSON schema, tests validate **key presence and semantic shape** — never string lengths or parsing integrity (those are guaranteed by the structured output contract).

```python
@pytest.mark.llm
async def test_work_order_generation_produces_valid_structure(
    client, studio_member, section_with_content
):
    response = await client.post(
        f"/projects/{section_with_content['project_id']}/work-orders/generate",
        json={"section_ids": [section_with_content["id"]]},
        headers=studio_member["headers"]
    )
    assert response.status_code == 201
    for wo in response.json():
        # Validate schema shape — string length not checked (guaranteed by structured output)
        assert isinstance(wo["title"], str) and wo["title"]
        assert isinstance(wo["description"], str) and wo["description"]
        assert isinstance(wo["acceptance_criteria"], str) and wo["acceptance_criteria"]
        assert isinstance(wo["implementation_guide"], str)
        assert wo["status"] == "backlog"
        # Validate semantic relevance — title should reference something from the section
        assert any(
            keyword in wo["title"].lower()
            for keyword in section_with_content["expected_keywords"]
        )

@pytest.mark.llm
async def test_conflict_detected_between_contradictory_sections(
    client, studio_member, project_with_contradictory_sections
):
    response = await client.post(
        f"/projects/{project_with_contradictory_sections['id']}/analyze",
        headers=studio_member["headers"]
    )
    assert response.status_code == 200
    issues = await client.get(f"/projects/.../issues", ...)
    data = issues.json()
    assert len(data) >= 1
    # Validate issue shape
    assert isinstance(data[0]["description"], str) and data[0]["description"]
    assert data[0]["status"] == "open"

@pytest.mark.llm
async def test_rag_context_respects_token_budget(
    client, studio_member, project_with_many_sections_and_artifacts
):
    # Verify context assembly doesn't exceed budget
    # by checking the LLM call's token usage recorded in token_usage table
    response = await client.post(".../thread/messages", ...)
    assert response.status_code == 200
    usage = await client.get("/me/token-usage", ...)
    assert usage.json()[0]["input_tokens"] <= 6500  # budget + small overhead
```

---

### 17.5 Frontend Testing Setup

#### Dependencies (`package.json`)
```json
{
  "devDependencies": {
    "jest": "^29",
    "@jest/globals": "^29",
    "jest-environment-jsdom": "^29",
    "@testing-library/react": "^14",
    "@testing-library/jest-dom": "^6",
    "@testing-library/user-event": "^14",
    "msw": "^2",
    "ts-jest": "^29"
  }
}
```

- **MSW (Mock Service Worker)** intercepts all `fetch` calls in Jest tests — no real HTTP, no real backend needed for unit/component tests
- **@testing-library/user-event** simulates real user interactions (typing, clicking, dragging)

#### MSW Handlers (`src/tests/mocks/handlers.ts`)
```typescript
export const handlers = [
  http.get('/projects/:pid/work-orders', () =>
    HttpResponse.json(workOrderListFixture)),
  http.post('/projects/:pid/work-orders/generate', () =>
    HttpResponse.json(generatedWorkOrdersFixture)),
  http.get('/projects/:pid/graph', () =>
    HttpResponse.json(graphFixture)),
  // ... one handler per API endpoint
]
```

#### File Layout
```
frontend/src/
├── tests/
│   ├── setup.ts                    # jest-dom matchers, MSW server setup
│   ├── mocks/
│   │   ├── handlers.ts             # MSW request handlers
│   │   ├── fixtures/               # typed JSON fixtures per entity
│   │   │   ├── studios.ts
│   │   │   ├── work-orders.ts
│   │   │   ├── graph.ts
│   │   │   └── ...
│   │   └── server.ts               # MSW server instance
│   ├── unit/
│   │   ├── hooks/
│   │   │   ├── useAuth.test.ts
│   │   │   ├── useStream.test.ts
│   │   │   ├── useStudioAccess.test.ts
│   │   │   └── useWebSocket.test.ts
│   │   └── services/
│   │       ├── api.test.ts
│   │       └── ws.test.ts
│   └── components/
│       ├── editor/
│       │   └── SplitEditor.test.tsx
│       ├── work-orders/
│       │   ├── KanbanBoard.test.tsx
│       │   ├── WorkOrderCard.test.tsx
│       │   └── GenerateWorkOrdersModal.test.tsx
│       ├── graph/
│       │   └── KnowledgeGraph.test.tsx
│       ├── chat/
│       │   ├── ChatRoom.test.tsx
│       │   └── ThreadPanel.test.tsx
│       └── issues/
│           └── IssuesPanel.test.tsx
```

#### Example Component Test
```typescript
// KanbanBoard.test.tsx
describe('KanbanBoard', () => {
  it('renders work orders grouped by status column', async () => {
    render(<KanbanBoard projectId="proj-1" />)
    expect(await screen.findByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('My Work Order')).toBeInTheDocument()
  })

  it('shows stale badge on stale work orders', async () => {
    render(<KanbanBoard projectId="proj-1" />)
    expect(await screen.findByTestId('stale-badge')).toBeInTheDocument()
  })

  it('hides create button for viewers', async () => {
    renderWithRole(<KanbanBoard projectId="proj-1" />, 'viewer')
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
  })
})

// useStudioAccess.test.ts
describe('useStudioAccess', () => {
  it('returns canEdit=false for viewer role', () => {
    const { result } = renderHook(() => useStudioAccess(), {
      wrapper: roleWrapper('viewer')
    })
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canView).toBe(true)
  })
})
```

---

### 17.6 E2E Testing (Playwright)

#### Setup
```
playwright.config.ts       # base URL, browser list, timeouts
e2e/
├── fixtures/
│   └── auth.fixture.ts    # logged-in page fixtures per role
├── pages/                 # Page Object Model
│   ├── LoginPage.ts
│   ├── StudioPage.ts
│   ├── ProjectPage.ts
│   ├── SectionPage.ts
│   ├── WorkOrdersPage.ts
│   └── KnowledgeGraphPage.ts
└── specs/
    ├── auth.spec.ts
    ├── studio-management.spec.ts
    ├── spec-editor.spec.ts
    ├── work-orders.spec.ts
    ├── knowledge-graph.spec.ts
    ├── publish.spec.ts
    ├── mcp.spec.ts
    └── cross-studio-access.spec.ts
```

Playwright tests run against the **full Docker Compose stack** (real backend, real test DB, real MinIO). The LLM is mocked at the HTTP level via a lightweight proxy that returns deterministic responses — E2E tests do not hit the real LLM API (that is reserved for `@pytest.mark.llm` tests).

#### Page Object Model Example
```typescript
// pages/WorkOrdersPage.ts
export class WorkOrdersPage {
  constructor(private page: Page) {}

  async generateFromSection(sectionTitle: string) {
    await this.page.getByRole('button', { name: /generate work orders/i }).click()
    await this.page.getByLabel(sectionTitle).check()
    await this.page.getByRole('button', { name: /generate/i }).click()
    await this.page.waitForSelector('[data-testid="work-order-card"]')
  }

  async dragToColumn(workOrderTitle: string, column: string) {
    const card = this.page.getByText(workOrderTitle)
    const target = this.page.getByTestId(`column-${column}`)
    await card.dragTo(target)
  }
}
```

#### Key E2E Scenarios
```typescript
// work-orders.spec.ts
test('Builder can generate, edit, and move a work order', async ({ page }) => {
  const wo = new WorkOrdersPage(page)
  await wo.generateFromSection('Data Model')
  await expect(page.getByTestId('work-order-card').first()).toBeVisible()
  await wo.dragToColumn('Create user schema', 'in_progress')
  await expect(page.getByTestId('column-in_progress')).toContainText('Create user schema')
})

test('viewer cannot create or edit work orders', async ({ viewerPage }) => {
  await expect(viewerPage.getByRole('button', { name: /create/i })).not.toBeVisible()
  await expect(viewerPage.getByRole('button', { name: /generate/i })).not.toBeVisible()
})

test('stale flag appears after section is updated', async ({ page }) => {
  // Edit a section that has a linked work order
  await page.goto('/projects/proj-1/sections/data-model')
  await page.getByTestId('editor').fill('Completely new content')
  await page.waitForTimeout(6000)   // wait for debounced drift check
  await page.goto('/projects/proj-1/work-orders')
  await expect(page.getByTestId('stale-badge')).toBeVisible()
})

test('cross-studio viewer sees spec but cannot edit', async ({ viewerPage }) => {
  await viewerPage.goto('/projects/proj-1/sections/data-model')
  await expect(viewerPage.getByTestId('editor')).toBeDisabled()
  await expect(viewerPage.getByTestId('knowledge-graph')).toBeVisible()
})
```

---

### 17.7 CI Pipeline

Pipeline file: `.gitlab-ci.yml` at the monorepo root.

#### Pipeline Structure

```
every push          →  backend:unit + backend:integration + frontend:unit  (parallel)
every MR merge      →  e2e  (after all unit/integration jobs pass)
nightly schedule    →  llm:regression
manual trigger      →  llm:regression  (via [llm-test] commit message or manual pipeline)
```

#### Full `.gitlab-ci.yml`

```yaml
# .gitlab-ci.yml

stages:
  - test
  - e2e
  - regression

default:
  image: python:3.12-slim
  before_script:
    - pip install -r backend/requirements.txt -r backend/requirements-test.txt

variables:
  # Test database — provided by the GitLab service container
  POSTGRES_USER: atelier_test
  POSTGRES_PASSWORD: atelier_test
  POSTGRES_DB: atelier_test
  TEST_DATABASE_URL: "postgresql+asyncpg://atelier_test:atelier_test@postgres/atelier_test"
  # Disable LLM tests by default (overridden in regression job)
  SKIP_LLM: "true"

# ─────────────────────────────────────────────
# STAGE 1: test  (runs on every push)
# ─────────────────────────────────────────────

backend:unit:
  stage: test
  script:
    - cd backend
    - pytest tests/unit -v --cov=app --cov-report=xml --cov-report=term-missing
  coverage: '/TOTAL.*\s(\d+%)$/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: backend/coverage.xml
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

backend:integration:
  stage: test
  services:
    - name: pgvector/pgvector:pg16
      alias: postgres
      variables:
        POSTGRES_USER: atelier_test
        POSTGRES_PASSWORD: atelier_test
        POSTGRES_DB: atelier_test
  script:
    - cd backend
    - alembic upgrade head
    - pytest tests/integration -v --cov=app --cov-report=xml --cov-append
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: backend/coverage.xml
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

frontend:unit:
  stage: test
  image: node:20-slim
  before_script:
    - cd frontend && npm ci
  script:
    - npm test -- --coverage --watchAll=false --ci
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: frontend/coverage/cobertura-coverage.xml
    paths:
      - frontend/coverage/
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

# Coverage gate — blocks MR if backend coverage drops below 90%
coverage:gate:
  stage: test
  image: python:3.12-slim
  needs: [backend:unit, backend:integration]
  script:
    - |
      COVERAGE=$(python -c "
      import xml.etree.ElementTree as ET
      tree = ET.parse('backend/coverage.xml')
      rate = float(tree.getroot().attrib['line-rate']) * 100
      print(f'{rate:.1f}')
      ")
      echo "Backend coverage: ${COVERAGE}%"
      python -c "assert float('${COVERAGE}') >= 90, f'Coverage {${COVERAGE}}% is below 90% threshold'"
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

# ─────────────────────────────────────────────
# STAGE 2: e2e  (runs on MR merge only)
# ─────────────────────────────────────────────

e2e:playwright:
  stage: e2e
  image: docker:24
  services:
    - docker:24-dind
  needs:
    - backend:unit
    - backend:integration
    - frontend:unit
  before_script:
    - docker compose -f docker-compose.test.yml pull
  script:
    - docker compose -f docker-compose.test.yml up -d
    - ./scripts/wait-for-services.sh
    - docker compose -f docker-compose.test.yml run --rm playwright npx playwright test
  after_script:
    - docker compose -f docker-compose.test.yml down -v
  artifacts:
    when: always          # upload report even on failure
    paths:
      - playwright-report/
    expire_in: 7 days
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'   # main branch only
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == $CI_DEFAULT_BRANCH'

# ─────────────────────────────────────────────
# STAGE 3: regression  (nightly + manual)
# ─────────────────────────────────────────────

llm:regression:
  stage: regression
  services:
    - name: pgvector/pgvector:pg16
      alias: postgres
      variables:
        POSTGRES_USER: atelier_test
        POSTGRES_PASSWORD: atelier_test
        POSTGRES_DB: atelier_test
  variables:
    SKIP_LLM: "false"
    LLM_API_KEY: $LLM_API_KEY       # stored in GitLab CI/CD Variables (masked)
  script:
    - cd backend
    - alembic upgrade head
    - pytest tests/llm -v -m llm --tb=short
  artifacts:
    when: always
    paths:
      - backend/llm-test-results.xml
    reports:
      junit: backend/llm-test-results.xml
    expire_in: 30 days
  rules:
    # Nightly at 02:00 UTC
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
    # Manual trigger via commit message flag
    - if: '$CI_COMMIT_MESSAGE =~ /\[llm-test\]/'
    # Manual trigger via GitLab UI
    - when: manual
      allow_failure: true
```

#### GitLab CI/CD Variables (Settings → CI/CD → Variables)

| Variable | Scope | Masked | Description |
|---|---|---|---|
| `LLM_API_KEY` | All branches | ✅ | API key for the configured LLM provider |
| `ENCRYPTION_KEY` | All branches | ✅ | Fernet key for git token encryption |
| `JWT_SECRET` | All branches | ✅ | JWT signing secret |
| `MINIO_ROOT_PASSWORD` | All branches | ✅ | MinIO root password for test stack |

#### Nightly Schedule Setup
In GitLab: **Settings → CI/CD → Schedules → New schedule**
- Description: `LLM Regression Tests`
- Interval: `0 2 * * *` (02:00 UTC daily)
- Target branch: `main`
- Variables: leave empty (picks up from pipeline variables)

#### Pipeline Rules Summary
- **Every push** — `backend:unit`, `backend:integration`, `frontend:unit` run in parallel
- **Every MR targeting main** — all unit/integration jobs + `coverage:gate` (blocks merge if < 90%)
- **Merge to main** — `e2e:playwright` runs against full Docker Compose stack
- **Nightly / `[llm-test]` commit / manual** — `llm:regression` runs real LLM API calls
- **Playwright report** — always uploaded as an artifact, available for 7 days
- **LLM results** — uploaded as JUnit XML, visible in GitLab's test report UI

---

### 17.8 TDD Workflow Per Slice

For every implementation slice, the development order is:

```
1. Write failing unit tests for the service logic
        ↓
2. Write failing integration tests for the API routes
        ↓
3. Implement the service + routes until all tests pass
        ↓
4. Write frontend component tests (MSW mocks the API)
        ↓
5. Implement the React components until tests pass
        ↓
6. Write E2E test for the happy path + key edge cases
        ↓
7. Verify E2E passes against the full stack
        ↓
8. Write @pytest.mark.llm tests if the slice involves LLM calls
        ↓
9. Refactor with confidence — all tests green
```

This ensures no feature ships without test coverage, and the test suite always reflects the current intended behaviour of the system.
