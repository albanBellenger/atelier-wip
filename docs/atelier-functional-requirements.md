# Atelier — Functional Requirements
_Version 2.3 — Issues Panel: home Studio Viewer read-only access clarified; permission matrix aligned; capabilities `is_studio_viewer` flag_

---

## 1. Overview

Atelier is a web-based collaborative specification tool where multiple participants build structured software specs together. Each participant is assisted by an LLM that understands the full project context. The final output is a folder of Markdown files and structured Work Orders committed to a self-hosted GitLab repository, ready for consumption by coding agents (Cursor, Claude Code, etc.) via MCP.

---

## 2. Hierarchy

The platform is organised in a strict four-level hierarchy:

```
Tool (global)
└── Studio                  ← an agency, department, or team
    └── Software            ← a product or system being built
        └── Project         ← a scoped workstream within the software (e.g. v2.0, mobile app)
            └── Work Order  ← a discrete, executable unit of work for a coding agent
```

Every piece of data — specs, artifacts, chat, issues, work orders — is scoped to this hierarchy. Studios are isolated from each other by default (Chinese wall).

---

## 3. Studios

### 3.1 What a Studio Is
A Studio is the top-level organisational unit. It can represent an agency building software for multiple clients, an internal IT department, or any team that owns one or more software products. Studios are fully isolated from each other — members of Studio A cannot see Studio B's data.

### 3.2 Creating a Studio
- Any authenticated user can create a Studio and becomes its Owner
- A Studio has a name, description, and optional logo
- The creating user is the first Studio Owner
- When inviting members, the Studio Owner chooses the role: Studio Owner, Studio Builder, or Studio Viewer

### 3.3 Cross-Studio Access
- A Studio Owner can request access to a specific Software owned by another Studio
- The request is approved or rejected by the **Tool Admin** (not the other Studio's Owner)
- Approved access grants read-only (**Viewer**) access by default
- The Tool Admin can upgrade the grant to edit access (**External**) if explicitly requested
- Cross-studio access is always scoped to a specific Software — it never grants access to the entire other Studio
- Access can be revoked at any time by any Tool Admin

---

## 4. Users & Authentication

### 4.1 Registration & Login
- Users register with email, password, and display name
- Users log in with email and password
- Sessions are maintained via JWT tokens
- The first user to register on the tool is automatically the Tool Admin
- **Multiple Tool Admins are supported** — any existing Tool Admin can promote another user to Tool Admin
- Tool Admin status can be revoked by any other Tool Admin (a Tool Admin cannot revoke their own status, preventing accidental lockout)
- **Emergency recovery:** if all Tool Admin accounts are inaccessible, a sysadmin can restore access by running a CLI command directly on the server (`python manage.py create-admin --email <email>`) without needing to touch the database manually
- **Admin user provisioning:** a Tool Admin can create a new user account directly from the Tool Admin panel (email, password, display name) without requiring the user to self-register. The created account behaves identically to a self-registered account and is not added to any Studio until explicitly invited.

### 4.2 Role Hierarchy

Roles cascade down the hierarchy. A higher role at a parent level implies the same or greater access at all child levels within that scope.

#### Tool Level
| Role | Description |
|---|---|
| **Tool Admin** | Full access to everything — all studios, all software, all config. Approves cross-studio access requests. Configures LLM/embedding provider. Views token usage across all studios. Manages budgets and embedding/LLM routing. Provisions user accounts. |

#### Studio Level
| Role | Description |
|---|---|
| **Studio Owner** | Manages the studio — creates software, invites/removes members, requests cross-studio access, manages git config and MCP keys. Sees all software and projects within the studio. |
| **Studio Builder** | Works within any software and project in their studio. Can edit specs, create work orders, upload artifacts, run analysis, and publish. Cannot manage members or create software. |
| **Studio Viewer** | Read-only access to all software and projects within the studio. Can view specs, work orders, artifacts, the knowledge graph, and download artifacts. Cannot edit, create, chat, run analysis, or publish. Useful for stakeholders, auditors, or clients who need visibility but should not modify the workstream. |

#### Cross-Studio Access (special cases)
| Role | Description |
|---|---|
| **Viewer** | Read-only access to a specific Software in another Studio. Can view specs, work orders, artifacts, and the knowledge graph. Cannot edit, create, chat, or publish. |
| **External** | Edit-level access to a specific Software in another Studio, granted explicitly by Tool Admin. Can edit spec sections, create and edit Work Orders, upload artifacts, use private LLM threads and project chat, and run conflict analysis. Cannot publish, manage members, configure git, manage MCP keys, or edit the Software Definition. Scoped strictly to the granted Software — no access to other Software in the target Studio. |

### 4.3 Permission Matrix

| Action | Tool Admin | Studio Owner | Studio Builder | Studio Viewer | External | Viewer |
|---|---|---|---|---|---|---|
| Configure LLM / embedding | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configure LLM routing & per-studio policy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage embedding model registry | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage budgets (studio cap, member cap, overage action) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View all-studio token usage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve cross-studio access | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Promote / revoke Tool Admin | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Provision user accounts | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create / delete Studio | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Manage Studio members | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Request cross-studio access | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage MCP API keys | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Create Software | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit Software Definition | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Configure git integration (Studio defaults) | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Configure git integration (per Software) | ✅ | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Upload / delete studio-scope or software-scope artifacts | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create Project | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Archive / unarchive Project | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Project outline | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit Project publish folder slug | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit spec sections | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Upload / delete project-scope artifacts | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Create / edit Work Orders | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Update Work Order status | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Generate Work Orders (LLM) | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Use private LLM thread | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Use project chat | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Use software chat | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Run conflict / gap analysis | ✅ | ✅ | ✅ | ❌ | ✅ (granted software only) | ❌ |
| Publish to git | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View spec / Work Orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Knowledge Graph | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View artifacts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View software activity log | ✅ | ✅ | ✅ | ✅ | ✅ (granted software only) | ✅ (granted software only) |
| View own notifications inbox | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View issues | ✅ | ✅ | ✅ (own triggers + own publish) | ✅ (read-only list; no analysis triggers) | ✅ (own triggers only) | ❌ |
| View token usage (own) | ✅ | ✅ (studio) | ✅ (self) | ❌ | ✅ (self) | ❌ |

---

## 5. Admin Configuration

### 5.1 Tool Admin Panel
- The Tool Admin panel is accessible to all users with Tool Admin role
- Any Tool Admin can promote another registered user to Tool Admin, or revoke Tool Admin status from another Tool Admin (self-revocation is blocked)
- All Tool Admins can view token usage across all studios
- All Tool Admins can manage budgets (see §13.5), the LLM routing registry (see §5.3), the embedding model registry (see §5.4), and provision user accounts (see §4.1)

### 5.2 Baseline LLM and Embedding Credentials
Tool Admins configure the baseline LLM and embedding provider for the entire tool:
- LLM provider (e.g. OpenAI, Anthropic, Azure), model name, API key, optional API base URL (for OpenAI-compatible endpoints)
- Embedding provider, model name, API key, optional API base URL
- Configuration applies globally as the **fallback** for all studios
- Changes take effect immediately (no restart required)
- A connectivity test action verifies the provider, key, and model are reachable before saving

### 5.3 LLM Routing Registry (per-studio overrides)
On top of the baseline credentials, Tool Admins maintain a routing registry that allows the **effective model to differ per studio and per call type**:
- A registry of providers and the model IDs each provider exposes (provider ID, list of model IDs, optional API base URL, connectivity status from verification)
- Per-studio enablement: a Studio Owner sees only the providers their Studio has been allowed to use; the Tool Admin toggles enablement per studio
- Optional routing rules allow the effective model to be overridden per studio and per call type (e.g. private thread, project chat, work order generation, conflict analysis, drift, knowledge graph)
- When no routing rule applies, the baseline credentials and model from §5.2 are used as the fallback
- A row-level connectivity probe verifies a given (provider, model) combination is reachable

### 5.4 Embedding Model Registry & Reindex Policy
Tool Admins maintain an embedding catalog and reindex policy:
- A registry of embedding models: model ID, provider, vector dimension, optional cost-per-million-tokens, optional region, optional default role
- Library coverage view per studio: artifact count, embedded artifact count, artifact vector chunk count, section vector chunk count
- A reindex policy controlling automatic re-embedding behaviour: trigger mode, debounce window in seconds, drift threshold percentage, retention in days
- A connectivity test action verifies the embedding endpoint and key

---

## 6. Software

### 6.1 What Software Is
A Software represents a product or system being built within a Studio — e.g. "Customer Portal", "Inventory API", "Mobile App". It is the container for all Projects, specs, artifacts, work orders, and issues related to that product.

### 6.2 Creating Software
- Studio Owners can create Software within their Studio
- Each Software has a name, description, and a **Software Definition** — a free-text instruction that shapes LLM behaviour across all projects within it (domain language, tech stack, architectural constraints, compliance requirements)
- Only Studio Owners can edit the Software Definition (Studio Builders cannot)
- The Software Definition is always the first item in every LLM context window within this Software

### 6.3 Git Integration
Git integration is configured at two levels: Studio defaults and Software-specific overrides. Both levels are Studio Owner only.

**Studio level (defaults):**
- Set in the Tool Admin panel under the studio's "GitLab" card
- Fields: git provider, repository URL, default branch, publish strategy, deploy token (stored encrypted)
- Acts as the studio-wide default for any Software that does not set its own git configuration

**Software level (overrides):**
- Set in the Software settings page
- Fields: GitLab repository URL, target branch, personal access token (stored encrypted)
- A Software with its own git configuration overrides the Studio default for publish operations on that Software's projects
- "Test Connection" validates the token and repo before saving

Git provider scope: **self-hosted GitLab only** (GitHub support planned for a future phase).

## 6b. Software Docs

### 6b.1 What Software Docs Are

Software Docs are a software-scoped outline of structured Markdown sections that hold durable documentation about the software itself — functional requirements, technical architecture, ADRs, data model overviews, runbooks, glossary. They are distinct from:

- The **Software Definition** (§6.2) — a short free-text instruction that steers LLM behaviour, edited by Studio Owners only.
- **Project Sections** (§7.3) — scoped to one project (a workstream), edited by all Studio Builders.
- The **Artifact Library** (§9.3) — upload-only reference material.

Software Docs fill the gap between these three: structured Markdown that describes the whole software, editable by the team, kept in the tool rather than uploaded as an artifact.

Software Docs are deliberately not a wiki — there are no free-form pages, no `[[internal links]]`, no nested page hierarchies. The outline is a flat, ordered list of sections, identical in structure to a Project outline but one level up in the hierarchy.

### 6b.2 Outline Management

- Studio Owner defines the Software Docs outline from scratch (an ordered list of named sections).
- Each section maps to one `.md` file in the published git output.
- Studio Owner can add, rename, reorder (drag and drop), and delete sections.
- All Studio Builders of the owning Studio can navigate and edit section content.
- Cross-studio Externals granted to the Software can read Software Docs and edit content under the same rules that apply to Project Sections in that Software.
- Studio Viewers and cross-studio Viewers have read-only access.

### 6b.3 Editing

Software Docs sections use the same split-view Crepe (Milkdown) editor and Yjs real-time collaboration as Project Sections (§8). The collaboration room key is distinct from Project Section rooms, so two users editing the same Software Docs section see each other, while a user editing a Project Section is not pulled into the docs room.

Section saves are persisted with the same debounce behaviour as Project Sections, and trigger the same re-embedding pipeline (§6b.5).

### 6b.4 Activity Log

Every Software Docs create, rename, reorder, content edit, and delete writes an entry to the existing Software Activity Log (§19) under verbs `software_doc_section_created`, `software_doc_section_updated`, `software_doc_sections_reordered`, and `software_doc_section_deleted`.

### 6b.5 Software Docs in LLM Context

Software Docs are first-class RAG context for every LLM call within the owning Software:

- On every edit, the section is chunked and embedded into the same `section_chunks` table that holds Project Section chunks.
- The smart context assembler (§10.5) treats Software Docs as a dedicated block, placed after the Software Definition and before the Project outline. The order is: Software Definition → Software Docs outline → Project outline → Current section → Retrieved chunks.
- When the budget tightens, the Project outline is trimmed first, then Software Docs, then the current section — same overflow rules as the existing assembler.
- Software Docs participate in similarity-based retrieval the same way Project Sections do, so a private thread on a Project Section can pull in relevant passages from Software Docs automatically when they are the best match.

### 6b.6 Publish Layout

Software Docs publish to a single location at the software root of the connected GitLab repository, alongside (not inside) project folders:

```
<repo_root>/
├── docs/
│   ├── README.md                       # Software Docs outline as a table of contents
│   ├── <docs-section-slug-1>.md
│   ├── <docs-section-slug-2>.md
│   └── …
├── <project-publish-folder-slug-1>/    # one folder per Project (§16.1)
│   └── …
├── <project-publish-folder-slug-2>/
│   └── …
└── …
```

Software Docs are republished whenever any project under the software is published. The docs files are idempotent — they reflect the current section content at publish time.

### 6b.7 Knowledge Graph

Software Docs sections appear in the Knowledge Graph (§12) as nodes of a new type `Software Doc Section` (visual treatment: a blue node with a docs glyph). Cross-section relationships detected by the conflict/gap analyser (§15) and code drift detection (§14b) link to these nodes. Software Docs do not participate in Work Order generation today (§11.2) — that remains Project-Section-only.

---

## 7. Projects

### 7.1 What a Project Is
A Project is a scoped workstream within a Software — e.g. "v2.0 Redesign", "Payment Module", "Mobile MVP". It contains the structured spec outline, sections, chat room, work orders, and issues for that workstream.

### 7.2 Creating a Project
- Studio Owners and Studio Builders can create Projects within a Software
- Each Project has a name, optional description, and a **publish folder slug** (see §7.4)
- All Studio Builders have equal access — no per-project ownership

### 7.3 Structured Outline
- Studio Owner defines the Project outline from scratch (list of named sections)
- Each section maps to one `.md` file in the final git output (e.g. `data-model.md`)
- Studio Owner can add, rename, reorder (drag and drop), and delete sections
- All Studio Builders can navigate and edit all sections

### 7.4 Publish Folder Slug
Each Project has a **publish folder slug** that determines its export root path inside the Software's git repository. This allows multiple Projects under the same Software to coexist in one repo without colliding.

- Default: derived from the Project name (lowercase, hyphenated ASCII slug)
- Editable by Studio Owner only
- Constraints: letters, numbers, underscores, and hyphens only; max 128 characters; unique per Software
- On publish, the slug is the root directory under which the Project's sections, README, and work orders are written (see §16.1)
- Renaming the slug renames the folder in the connected GitLab repo on the next publish; the old folder is left in place unless removed manually

### 7.5 Project Archival
Projects can be archived to remove them from active workspaces without deleting their content.

- Studio Owner or Studio Builder (owning studio, not cross-studio grants) can archive or unarchive any Project in their Studio
- Archived Projects are hidden by default in Studio and Software project lists; a "Show archived" toggle reveals them
- Archived Projects retain all data (sections, work orders, artifacts, chat history, issues, graph) and remain readable
- Archived Projects do not appear in default work order or attention summaries
- Archival is reversible at any time

---

## 8. Spec Editor

### 8.1 Split-View Editor
- Each section opens in a split-view editor:
  - **Left pane:** raw Markdown source (CodeMirror)
  - **Right pane:** rendered Markdown preview (live, updates as you type)
- The divider between panes is resizable

### 8.2 Real-Time Collaborative Editing
- Multiple participants can edit the same section simultaneously
- Changes from all participants appear in real time
- Each participant's cursor is visible, labeled with display name and a unique colour
- Changes are auto-persisted to the database (debounced ~2 seconds)
- Save state shown in UI ("Saving..." / "Saved")

---

## 9. Artifacts

### 9.1 Uploading & Managing Artifacts
- Any Studio Builder can upload artifacts to a Project
- Supported types: PDF, Markdown (`.md`)
- Members can also create new Markdown artifacts directly in the tool via an in-app editor
- All artifacts are listed, viewable, and downloadable by all Studio Builders, Studio Viewers, and cross-studio Viewers/Externals (subject to scope rules in §9.3)
- Any Studio Builder can delete a project-scope artifact; Studio Owner can delete any artifact in any scope (see §9.3)

### 9.2 Artifact Role in LLM Context
- All artifacts are chunked and embedded for RAG on upload
- Relevant chunks are automatically retrieved per LLM message — no manual referencing needed
- Viewers (Studio Viewer and cross-studio Viewer) can download artifacts but artifact content is not included in their LLM context (they have read-only access, no LLM interaction)

### 9.3 Artifact Library — Scopes (Project / Software / Studio)
Artifacts can be uploaded at three different scopes. The scope determines where the artifact is visible and which LLM contexts can retrieve it.

| Scope | Visible in | Used as RAG context for |
|---|---|---|
| **Project** | The owning project's artifact list, the parent software's aggregate library, the studio library | LLM calls within that project |
| **Software** | All projects under that software, the studio library | LLM calls within any project under that software |
| **Studio** | The studio library only (not on per-software lists) | LLM calls in any project in that studio (subject to exclusion flags) |

**Upload entry points:**
- Project scope: project artifacts page or in-app Markdown editor
- Software scope: software settings or library
- Studio scope: studio settings or unified artifact library

**Unified library view:**
- A studio-wide artifact library lists artifacts from all three scopes in one merged view, sorted and filterable, with optional `?softwareId=` filter to scope the view
- Each row indicates its scope (Project / Software / Studio) via a visible badge

**Scope changes:**
- Studio Owner (or Tool Admin) can change an artifact's scope after upload, moving the file in storage to the matching prefix and updating retrieval visibility
- Scope changes are bound to the artifact's owning studio — an artifact can never be moved across studios

**Exclusion flags:**
- Software-scope and studio-scope artifacts can be excluded from a specific software or project's context (e.g. a studio-wide style guide that is not relevant to a particular project)
- Exclusion is set by Studio Owner / Studio Builder in the software or project settings
- Exclusion does not delete the artifact — it only suppresses it from RAG retrieval at the affected scope

**Permissions for scope-level write operations:**
- Project-scope upload/delete: Studio Builder, Studio Owner, or External (granted software)
- Software-scope upload/delete: Studio Builder or Studio Owner of the owning studio
- Studio-scope upload/delete: Studio Builder or Studio Owner of the owning studio
- Cross-studio Externals and cross-studio Viewers cannot upload at studio or software scope

### 9b Codebase index (linked GitLab repository)
- Each Software with a configured GitLab URL, branch, and token may maintain **codebase snapshots**: a point-in-time tree of repository blobs on a resolved commit SHA.
- Studio Builders who belong to the owning studio (not cross-studio-only grants) can request **Re-index** from Software settings; indexing runs asynchronously, chunking sources with tree-sitter where supported (Python, TypeScript/JavaScript, Rust, Go, Java, C/C++, C#, Ruby, PHP, Swift, Kotlin, Scala, etc.) and falling back to newline-aware splits otherwise.
- Snapshots progress through `pending` → `indexing` → `ready` (or `failed`). At most one snapshot remains **`ready`** per software; older ready snapshots are marked **`superseded`** and their chunk rows are deleted to bound storage.
- Embeddings are stored in `codebase_chunks` with **HNSW** (`vector_cosine_ops`), mirroring `section_chunks` / `artifact_chunks`. Usage is recorded with embedding `call_source` values `codebase_index` (bulk index) and `codebase_rag` (query embedding).
- Tool Admins may call diagnostics (`GET /software/{id}/codebase/diagnostics?q=`) to inspect an LRU-cached **repository map** (PageRank over a co-directory graph) plus vector hits against the current ready snapshot.

## 9b. Codebase Index

### 9b.1 What It Is

A Codebase Index is a snapshot of the source code in a Software's connected GitLab repository, indexed for retrieval and analysis by the LLM. The index lets Atelier compare the spec to what was actually built, draft documentation from existing code, and propose documentation updates after work ships.

A Software must have a configured GitLab URL, branch, and token (§6.3) before it can be indexed.

### 9b.2 Snapshots

The index is built as **snapshots** — a snapshot is a point-in-time view of the repository at a specific commit SHA.

- **Lifecycle:** `pending` → `indexing` → `ready` (or `failed`).
- **At most one ready snapshot** per Software. When a new snapshot reaches `ready`, the previous ready snapshot is marked `superseded` and its embedded chunk rows are deleted to bound storage. The snapshot record itself is retained for audit.
- Snapshots that fail (network error, permission denied, repo too large) keep their row with an error message; the next reindex attempt creates a new snapshot rather than retrying the failed one.

### 9b.3 Triggering a Reindex

- Studio Builders of the owning Studio can request a reindex from the Software settings page ("Codebase" panel).
- Cross-studio Externals cannot trigger a reindex even if they have edit access to the Software, since the operation consumes the owning studio's embedding budget.
- Reindex runs asynchronously. The UI shows the current snapshot's status, file count, chunk count, last-indexed SHA, last-indexed timestamp, and the last five snapshots in history.

### 9b.4 Indexing Behaviour

- The indexer walks the repository tree at the resolved commit SHA and selects source files for indexing.
- **Skipped paths:** `node_modules/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `.git/`, `coverage/`, files matching `*.min.js`, and common binary extensions (images, archives, fonts, audio, video, compiled libraries).
- **Per-language chunking:** the indexer uses tree-sitter to split source files at function, method, class, interface, and module boundaries for the languages it recognises (Python, TypeScript, JavaScript, Rust, Go, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, Markdown). Files in unrecognised languages are split at line boundaries with a configurable maximum chunk size.
- **Embedded base64 payloads** (e.g. inline images in Markdown) are stripped before embedding so they cannot exceed provider input limits.
- **Caps:** indexing honours administrative caps on the maximum number of files per snapshot, the total bytes per snapshot, and the maximum bytes per file. Snapshots that hit a cap stop cleanly rather than failing — the snapshot is marked `ready` with whatever was indexed and the limit is noted in the snapshot record.

### 9b.5 Codebase Chunks and Symbols

- Code chunks are stored with their file path, language, byte range, line range, and embedding. Chunk embeddings live in their own table separate from artifact chunks and section chunks, and are queried only by codebase-aware features (Backprop, code drift, doc sync) — never mixed into normal chat or thread context.
- Top-level symbols (functions, methods, classes) extracted by tree-sitter are stored separately as a lightweight symbol index, used for name-based grounding when retrieval by similarity is sparse.

### 9b.6 Repository Map

For each ready snapshot, the system computes a **repository map** — a ranked summary of files in the repository, ordered by structural centrality. The map is used by codebase-aware agents to give the LLM a one-page overview of "what's important in this codebase" alongside specific retrieved chunks.

### 9b.7 Diagnostics

Tool Admins have a diagnostic endpoint to inspect the repository map and to run a vector search against the current ready snapshot for a free-text query. This is used to validate retrieval quality before exposing a feature to builders; it is not a user-facing capability.

### 9b.8 Token Usage Attribution

Every embedding call made by the indexer records token usage against the owning studio with `call_source = "codebase_index"`. Every retrieval query that uses the index records `call_source = "codebase_rag"`. These appear in the Token Usage Dashboard (§13) as normal embedding charges.

---

## 10. LLM Interaction

### 10.1 Private Thread (per user, per section)
- Each Studio Builder has a private LLM conversation scoped to a specific section
- Not visible to other participants
- LLM helps write, refine, and improve section content
- LLM has access to the full smart context (Software Definition, project outline, current section, relevant other sections, relevant artifact chunks)
- LLM automatically flags conflicts and gaps inline at the end of every response
- Members can start a new thread (clear history) at any time
- Responses stream token by token

The composer supports **slash commands** that route the request to a specific operation rather than a free-form chat (see §10.4).

### 10.2 Shared Project Chat Room
- One persistent chat room per Project, visible to all Studio Builders
- Any member can send messages; all members see LLM responses streamed live simultaneously
- LLM has full project context in this room
- Chat history is persistent and paginated (infinite scroll upward)

### 10.3 Shared Software Chat Room
In addition to per-project chat, each Software has a chat room scoped to the whole Software (all projects under it).

- One persistent chat room per Software, visible to all Studio Builders of the owning Studio (and Externals granted to that Software)
- Live broadcast and streaming behaviour identical to the project chat room
- LLM has full software context (all projects, all sections, software definition, software-scope and studio-scope artifacts) when answering — useful for cross-project questions ("how do these two projects share auth?")
- Chat history is persistent and paginated
- A workspace composer on the Software dashboard sends a message into this room; members can also seed a draft from the dashboard and continue in the chat tab

### 10.6 Software-wide documentation (context and publish)
- Each Software may have shared Markdown documentation pages that are **not** tied to a single Project (see the Software **Docs** tab).
- Pages use the same collaborative editing model as specification sections and are **included in embedding/RAG** for that Software so retrieval can surface `software_doc:*` chunks alongside project sections and artifacts.
- When a Project is **published** to GitLab, the export includes a `docs/` folder under that project’s publish root containing these shared pages (and `docs/README.md` when any pages exist).

### 10.4 Slash Commands (Private Thread Composer)
The private-thread composer recognises slash-prefixed commands that change how the user's message is interpreted by the assistant. Plain text without a leading slash is treated as a free-form question.

| Command | Behaviour |
|---|---|
| `/ask <question>` | Free-form question with section context — same as plain text |
| `/improve [instruction]` | Structured rewrite of the current section. Calls a structured (non-streaming) endpoint that returns improved markdown. Optional instruction refines the rewrite goal. |
| `/critique [focus]` | Streamed critique of the section for gaps, ambiguities, and risks |
| `/append <content>` | Streamed reply biased toward content that should be appended to the end of the section |
| `/replace <instruction>` | Streamed reply that proposes replacing the user's current editor selection. Disabled if no selection is active. |
| `/edit <instruction>` | Streamed reply that proposes a unique snippet replacement inside the section |

**Editor selection as context.** When the editor has an active selection, the composer can include the selected plaintext as a "selected excerpt" block in the LLM context, so the model can answer scoped to that selection.

**Patch proposal.** For commands whose intent is to modify the section (`/append`, `/replace`, `/edit`, and `/improve`), the server may return a structured `patch_proposal` after the streamed reply. The client displays the proposed change as a preview; the user must explicitly **Apply** before any change is written into the collaborative editor. No silent auto-apply.

### 10.5 Smart Context Assembly
Every LLM message assembles context within a configurable token budget:

| Priority | Content | Rule |
|---|---|---|
| 1 | Software Definition | Always included — summarised if over 500 tokens |
| 2 | Software documentation outline (shared doc page titles) | Always included as a brief summary when the software has doc pages |
| 3 | Project outline (section titles only) | Always included as a brief summary |
| 4 | Current section (full content) | Always included — truncated as last resort (see below) |
| 5 | Other spec sections & software doc pages | Retrieved by semantic relevance to the user's message |
| 6 | Artifact chunks | Retrieved by semantic relevance to the user's message |
| 7 | Git history | Only included when explicitly requested by the user |

Sections and artifact chunks beyond the token budget are trimmed by relevance score. Users never manage this manually.

**Overflow fallback strategy** — applied in order if mandatory items (software definition, outlines, and current section) alone exceed the token budget:

1. **Summarise the Software Definition** — if the Software Definition exceeds 500 tokens, the LLM generates a compressed summary to use in its place (cached per session)
2. **Truncate the current section from the bottom** — the current section is trimmed from the end, preserving at least the first 20% of its content (the opening context is most important for the LLM)
3. **UI warning banner** — if the software definition, outline blocks, and current section still exceed the budget after steps 1 and 2, a warning banner is shown to the user: "This section is very large — some content was trimmed from context. Consider splitting this section into smaller parts."
4. The LLM call always proceeds — the system never silently fails or blocks the user

---

## 11. Work Orders

### 11.1 What a Work Order Is
A Work Order is the atomic unit of execution — the discrete, self-contained instruction a developer or coding agent uses to implement a specific piece of functionality. It contains everything needed without switching context.

Each Work Order contains:
- Title and detailed description
- Status: Backlog / In Progress / In Review / Done
- Assignee (optional, any Studio Builder)
- Phase (for sequencing)
- Links to originating spec sections
- Implementation guidance (LLM-generated or manually written)
- Acceptance criteria
- Embedded upstream context (relevant spec excerpts auto-included when pulled via MCP)

### 11.2 Creating Work Orders

**Auto-generation:** any Studio Builder can select one or more spec sections and trigger LLM-based Work Order generation. The LLM reads the section content and decomposes it into discrete, implementable tasks, each with a title, description, implementation guidance, and acceptance criteria.

**Manual creation:** any Studio Builder can create a Work Order from scratch, or edit any auto-generated one.

Work Orders are always linked to at least one spec section.

### 11.3 Work Order Lifecycle
- Sequenced into phases via drag-and-drop (e.g. Phase 1 — Foundation, Phase 2 — Core Features)
- Status transitions: Backlog → In Progress → In Review → Done → Archived
- Any Studio Builder can update status and assignee
- When a linked spec section changes significantly, the Work Order is automatically flagged **Potentially Stale** (drift detection — see Section 14)
- Status changes generate notifications to the assignee and creator (see §18)

**Status definitions:**
| Status | Meaning | Exported on Publish |
|---|---|---|
| Backlog | Not yet started | ✅ |
| In Progress | Actively being implemented | ✅ |
| In Review | Implementation complete, under review | ✅ |
| Done | Completed and accepted | ❌ (excluded from future exports) |
| Archived | Explicitly excluded — cancelled, deferred, or obsolete | ❌ |

Done Work Orders are excluded from git exports after the publish cycle in which they were first marked Done. They remain fully visible in the tool for history and audit. Archived Work Orders are immediately excluded from all future exports and are visually de-emphasised in the board and list views but never deleted.

### 11.4 Work Order Views
- **Kanban board:** columns by status, cards show title, assignee, phase, stale flag
- **List view:** grouped by phase, sortable by status and assignee
- **Filter:** by assignee, status, phase, linked section, stale flag

---

## 12. Knowledge Graph

### 12.1 What It Is
The Knowledge Graph is a visual, interactive map of all relationships within a Project. Every key artifact is a node; every relationship between them is a typed edge. It makes the full structure of the spec and its downstream work immediately visible and navigable.

### 12.2 Node Types
| Node | Colour | Description |
|---|---|---|
| **Section** | Blue | A spec section (e.g. Data Model, API Contracts) |
| **Artifact** | Green | An uploaded PDF or Markdown file |
| **Work Order** | Orange | A discrete task derived from sections |
| **Issue** | Red | A detected conflict or gap |

### 12.3 Edge Types
| Edge | Meaning |
|---|---|
| Section → Work Order | This section generated or informs this Work Order |
| Section → Issue | This section is involved in a detected conflict/gap |
| Section → Section | These sections reference or depend on each other (LLM-detected) |
| Artifact → Section | This artifact was used as context when this section was written |
| Work Order → Work Order | This Work Order depends on another (manually set) |

### 12.4 Graph UI
- Interactive force-directed graph (zoom, pan, drag nodes)
- Clicking any node navigates to the relevant section, work order, artifact, or issue
- Nodes are colour-coded by type
- Stale Work Orders and conflicted sections are visually highlighted (pulsing border)
- Available as a tab on the Project page alongside the Outline view
- Studio Viewers, cross-studio Viewers, and Externals have read-only access to the graph

**Clustering (for large projects):**
- By default, nodes are grouped into clusters by node type (Sections cluster, Work Orders cluster, Artifacts cluster, Issues cluster) to prevent hairball rendering
- Work Orders are additionally sub-clustered by Phase within their cluster
- Users can expand or collapse any cluster by clicking it
- Individual nodes become visible on cluster expand
- Edges between clusters are shown as aggregated bundle edges (e.g. "12 relationships") until expanded
- A cap of **150 visible nodes** is enforced at any time — when exceeded, the graph shows clusters only and prompts the user to filter (by phase, section, or status) before expanding
- Filter controls on the graph panel: filter by node type, phase, status (Work Orders), and stale/conflicted flag

---

## 13. Token Usage Dashboard & Budgets

### 13.1 Purpose
LLM token costs are tracked as a first-class concern — not an afterthought — to give full visibility into AI usage and cost across the tool, and to allow Tool Admins to enforce spending caps.

### 13.2 What Is Tracked
- Token usage broken down by: Studio, Software, Project, user, and agent call type (private thread, project chat, software chat, Work Order generation, conflict analysis, drift detection, Knowledge Graph analysis, MCP pulls, slash-command operations)
- Each row stores a **`call_source` string** plus scope columns (studio, software, project, work order, user); the high-level “call type” labels above may map to **one or many** `call_source` values — see `atelier-technical-architecture.md` (section **`token_usage`** / **`call_source` values**). For example, **project chat and software chat both use `call_source = chat`**; reporting distinguishes them via **`project_id` vs `software_id`**. Codebase embedding usage uses **`codebase_index`** and **`codebase_rag`** as described in §9b.8.
- Estimated cost in USD based on the configured provider's pricing
- Usage trend over time (daily / weekly / monthly views)

### 13.3 Access Levels
- Tool Admin: sees all studios, all software, all users
- Studio Owner: sees their own studio only (all software, all members)
- Studio Builder: sees their own usage only
- Studio Viewer: no access to token usage

### 13.4 Export
- CSV export of usage data filterable by studio, software, project, user, date range, and call type

### 13.5 Budgets (Tool Admin)
Tool Admins can cap monthly LLM spend per studio and per individual member. Budgets are enforced before each LLM call.

**Per-studio monthly cap:**
- Optional USD cap per studio, configurable from the Tool Admin Budgets panel
- A configurable **overage action** determines what happens when the studio's month-to-date estimated spend exceeds the cap. Supported actions:
  - `pause_generations` — block further LLM calls until the next month or until the cap is raised (returns 402 with a structured error)
  - `allow_with_warning` — allow calls but surface a warning to users
  - `allow_alert_studio_admin` — allow calls and notify studio owners
  - `allow_alert_tool_admin` — allow calls and notify Tool Admins
  - `allow_bill_org` — allow calls and continue to log spend for billing reconciliation
- Default action when none is set: `pause_generations`

**Per-builder monthly cap:**
- Optional USD cap per studio member, set per (studio, user) pair
- When a member's month-to-date estimated spend in a studio exceeds their cap, LLM calls return 402 with a structured error directing them to ask a Studio or Tool Admin to raise the cap

**Deployment-wide ceiling:**
- A non-configurable ceiling shown in the Budgets UI as the maximum any single studio cap can be set to

**UI:**
- The Budgets section in the Tool Admin panel has two tabs: per-studio caps and per-builder caps
- Each row shows: month-to-date spend, current cap, remaining, and (for studios) the overage action
- Studio Builders see their personal cap, current spend, and a progress bar in the workspace token strip on their Builder home dashboard

---

## 14. Drift Detection

### 14.1 What It Does
When a spec section changes, the system automatically checks whether any linked Work Orders have been invalidated by the change — keeping the spec and the execution plan in sync.

### 14.2 How It Works
- On every section save (debounced), the LLM compares the new section content against the description and acceptance criteria of all linked Work Orders
- If a significant divergence is detected, the Work Order is flagged **Potentially Stale** with a brief explanation of what changed
- The stale flag is visible on the Work Order card, in the Kanban board, in the list view, and in the Knowledge Graph (highlighted node)

### 14.3 Resolution
- Any Studio Builder can dismiss the flag (marking the Work Order as reviewed and still valid)
- Or edit the Work Order to bring it back into alignment with the updated spec
- Dismissals are logged for audit (who dismissed, when)

## 14b. Code Drift Detection

### 14b.1 What It Does

When a Software has a ready codebase snapshot (§9b), Atelier can detect divergence between the written specification and what the code actually does. Two kinds of drift are detected:

- **Section drift** — a Project Section or Software Docs section makes claims that the code no longer supports (or never supported).
- **Work Order drift** — an active Work Order describes work that does not appear to be present in the code.

Detected drift surfaces as Issues in the existing Issues Panel (§15) alongside conflict and gap issues, with distinct visual treatment.

### 14b.2 When It Runs

- **Automatically:** after every successful publish (§16.1), code drift detection runs as a background task for the published software. The user who triggered the publish does not wait on it.
- **Manually:** any Studio Builder can run code drift detection on demand from the Issues Panel header ("Run code drift analysis"). The button is disabled when the Software has no ready codebase snapshot, with a tooltip directing the user to index the codebase first.

### 14b.3 What Is Checked

Per run:

- **Sections:** all Software Docs sections under the Software, plus all Project Sections from non-archived Projects under the Software, bounded to the most-recently-updated 50 sections.
- **Work Orders:** all Work Orders with status `Backlog`, `In Progress`, or `In Review` in non-archived Projects under the Software, bounded to the most-recently-updated 50.

Done and Archived Work Orders are never checked.

Each section and each work order is compared individually against a small set of code chunks retrieved by similarity from the ready snapshot, plus the repository map. The LLM is instructed to be conservative — it flags only divergences a careful reader would call out, not stylistic differences or missing how-to detail.

### 14b.4 What the Results Look Like

**Section drift Issues** carry:
- The affected section (link).
- A severity rating: `low`, `medium`, or `high`.
- A short human-readable reason.
- A list of referenced code locations (file path with line range, read-only — the user opens the file in their own editor).

**Work Order drift Issues** carry:
- The affected Work Order (link).
- A verdict: `partial` or `missing` (`complete` work orders do not produce an issue).
- A short reason.
- Referenced code locations.

### 14b.5 De-duplication and Re-runs

Before each run, all previous **open, auto-generated** code drift issues for the Software are cleared. Pre-existing conflict and gap issues from the spec-vs-spec analyser (§15) are **not** affected.

Manually opened code drift issues (created via the manual trigger) follow the same audit rules as other manually-created issues — they are retained until resolved.

### 14b.6 Resolution

Code drift issues use the existing Open / Resolved lifecycle and are resolved by any user who can see them. There is no auto-fix — the user updates the spec, edits the code, or marks the issue resolved if they decide the divergence is intentional.

### 14b.7 Knowledge Graph

Code drift issues appear as Issue nodes in the Knowledge Graph (§12) linked to the affected Section or Work Order via a new edge type `drifts_from_code`.

### 14b.8 What This Does Not Do

- Code drift never auto-edits a section, a Work Order, or any code. It only opens Issues.
- It does not analyse the entire codebase against a single Issue — it analyses each section / work order against the code chunks most likely to be relevant.
- It does not detect drift inside artifact content (PDFs, Markdown uploads). Drift detection applies to authored specs only.

---

## 15. Conflict & Gap Detection (Issues Panel)

### 15.1 When It Runs
- **Automatically** on every publish to GitLab
- **Manually** at any time via "Run Analysis" button (any Studio Builder)

### 15.2 What It Checks
- Each pair of spec sections: contradictions or conflicts
- Each section individually: obvious missing information for a software specification
- Previous auto-generated open issues are cleared before each new run (no duplicates)

### 15.3 Who Sees Results
- Studio Owners always see all issues in the Issues Panel
- Studio Builders and Externals see issues if they triggered the analysis run **or** if they triggered the publish that caused the auto-analysis
- This means: if a Studio Builder publishes, they see all issues generated by that specific publish event, in addition to any issues from manual analysis runs they triggered
- Auto-publish issues from publishes triggered by someone else are visible to Studio Owners only
- **Studio Viewers** (home studio) can open the Issues Panel and browse the issue list in **read-only** mode: they cannot run conflict/gap analysis, code drift, or other privileged actions from that surface; visibility of individual rows still follows the trigger/publish rules above (they do not gain Owner-wide visibility).
- **Cross-studio Viewers** do not see the Issues Panel (UI and API are denied for that grant type).

### 15.4 Issue Management
- Each issue shows: affected section(s), conflict/gap description, status (Open / Resolved)
- Users with issue-management privileges (Studio Owner, Studio Builder, External where applicable) who can see an issue can mark it Resolved; read-only viewers cannot change issue state
- Resolved issues remain in history for audit purposes
- Issues appear as nodes in the Knowledge Graph linked to their affected sections

## 15b. Documentation Sync (Suggestions from Work Orders)

### 15b.1 What It Does

When a Work Order is marked `Done`, Atelier can suggest updates to the Software Docs to reflect the work that just shipped. Each suggestion proposes a **replacement** for one Software Docs section, alongside a rationale. The Builder reviews, applies (or applies with edits), or dismisses.

Documentation Sync never edits a section directly — the proposed replacement is loaded into the editor as a pending change, and the user must save explicitly.

Suggestions target **Software Docs only**. Project Sections are out of scope for sync — they describe a workstream that is itself in flight, so auto-suggested edits create more confusion than they resolve.

### 15b.2 When It Runs

- **Automatically:** every time a Work Order transitions to `Done`, a background sync task is scheduled. The user who set the status does not wait on it. Failure is silent.
- **Manually:** any Studio Builder can run sync on demand from the Work Order detail page ("Suggest doc updates"). The button is disabled when the Software has no ready codebase snapshot.

### 15b.3 What Is Considered

The sync agent receives:

- The Work Order's title, description, and acceptance criteria.
- A short list of candidate Software Docs sections that look topically relevant to the Work Order (typically 5 candidates).
- A short list of code chunks retrieved by similarity from the ready snapshot, oriented around what the Work Order describes (typically 8 chunks).

It returns zero, one, or more proposals, each targeting exactly one of the candidate sections.

### 15b.4 What the Suggestions Look Like

Each suggestion surfaces as an Issue of kind `doc_update_suggested` in the existing Issues Panel, with:

- The target Software Docs section (link).
- A rationale (the agent's reasoning).
- A side-by-side diff between the section's current Markdown and the proposed replacement Markdown.
- Three actions: **Apply**, **Apply with edits**, **Dismiss**.

**Apply** and **Apply with edits** both navigate to the Software Docs editor for the target section, with the proposed replacement loaded as a pending Yjs change. The section is not saved until the user explicitly saves. On save, the Issue is moved to Resolved with reason `applied`.

**Dismiss** moves the Issue to Resolved with reason `dismissed`. No edit is made.

### 15b.5 Knowledge Graph

Doc sync issues appear in the Knowledge Graph (§12) linked to both the originating Work Order (via a new edge type `suggests_doc_update`) and to the target Software Docs section.

### 15b.6 What This Does Not Do

- Doc sync never writes to a section without explicit user save.
- Doc sync does not propose changes to Project Sections, Work Orders, artifacts, the Software Definition, or code.
- There is no auto-apply toggle in the current version. (Tracked under §20 Future Scope.)
- Doc sync is not retrospective — it runs on Work Orders that newly transition to `Done`, not on Work Orders that were Done before the feature shipped.

## 15c. Backprop (Drafting Software Docs from Code)

### 15c.1 What It Does

When a Software has a ready codebase snapshot (§9b), Atelier can draft Software Docs content from the code. Two drafting flows are available:

- **Outline draft** — propose an initial outline of Software Docs sections (titles, slugs, one-sentence summaries) for a Software whose docs are empty (or sparse).
- **Section draft** — for one existing Software Docs section, propose the section's Markdown content from the code.

Both flows produce **proposals**. The Builder reviews, accepts the parts they want, and the tool inserts them. Backprop never writes content to the docs without an explicit accept.

### 15c.2 Outline Draft

- Available on the Software Docs page (§6b) to **Studio Owners only** — outline structure changes are owner-scoped.
- Click "Draft outline from codebase" to open a modal with an optional free-text hint ("emphasise the API surface", "we ship a CLI and a library, cover both").
- The system returns a proposed list of 5–12 sections. Each row shows the title, slug, and one-line summary, with a checkbox.
- The owner selects which proposed sections to accept and clicks "Accept selected". Selected sections are created in the order returned. Existing sections are not touched.

### 15c.3 Section Draft

- Available on each Software Docs section page to **Studio Builders and above**.
- Click "Draft from codebase" to request a draft for this specific section.
- The result is shown in a side-by-side diff modal: the section's current content on the left, the proposed Markdown on the right, with the list of source files the agent grounded its draft in below.
- "Insert into editor" loads the proposed Markdown into the live editor as a pending Yjs change. The section is not saved until the user explicitly saves.
- "Dismiss" closes the modal without changing anything.

### 15c.4 How the Draft Is Grounded

Backprop's section drafter receives:

- The section's current title and content (the content is treated as a summary of intent, not a constraint to preserve verbatim).
- The repository map (§9b.6).
- A short list of code chunks retrieved by similarity to the section's title and current content.
- The Software Definition.

The agent is instructed to cite source files inline using backticked paths so the Builder can spot-check the draft.

### 15c.5 Pre-conditions and Failure Modes

- Both flows require a `ready` codebase snapshot. The buttons are disabled (tooltip: "Index the codebase first") when no snapshot is ready.
- If the agent returns an empty outline or an empty section draft, the modal shows a "No draft produced" message rather than an error — this is normal for sparse or unusual codebases and not a system failure.

### 15c.6 What This Does Not Do

- Backprop never writes content without explicit accept.
- Backprop does not draft Project Sections, Work Orders, or artifact content. It targets Software Docs only.
- Backprop does not modify code.

---

## 16. Publishing & Version History

### 16.1 Publishing
- Any Studio Builder can trigger a publish
- On publish, a single GitLab commit is created containing the following directory layout, rooted at the Project's **publish folder slug** (see §7.4):

```
<publish_folder_slug>/
├── README.md                          # project name + outline table of contents
├── sections/
│   ├── <section-slug-1>.md
│   ├── <section-slug-2>.md
│   └── …                              # one .md per spec section
└── work-orders/
    ├── <work-order-id-1>.md
    └── …                              # active Work Orders only (Backlog, In Progress, In Review)
```

- **Active Work Orders only** (Backlog, In Progress, In Review) are exported. Done and Archived Work Orders are excluded.
- Conflict detection runs automatically — the user who triggered the publish sees the resulting issues (see §15.3)
- Drift detection runs on all active Work Orders
- Optional custom commit message; if omitted, one is auto-generated
- On success: commit URL shown as a clickable link
- On success: editors of the project receive a `publish_commit` notification (see §18)

### 16.2 Renaming the Publish Folder
- When a Project's publish folder slug is changed, the next publish renames the folder in the connected GitLab repo via a single commit containing the move actions
- The old folder is left in place if it cannot be moved cleanly; users may clean it up directly on GitLab

### 16.3 Version History
- Readable commit timeline per Software (message, author, timestamp, link to GitLab)
- Users view and compare past commits directly on GitLab
- Users never interact with git directly

---

## 17. MCP Integration (Coding Agent Bridge)

### 17.1 What It Is
Atelier exposes an MCP (Model Context Protocol) server so that coding agents — Cursor, Claude Code, or any MCP-compatible IDE — can pull Work Orders and their full embedded context directly from the tool without leaving the editor.

### 17.2 How It Works
- Studio Owners generate scoped MCP API keys for their Studio (per-developer keys recommended)
- The developer configures their IDE to connect to the Atelier MCP endpoint using their key
- From within the IDE, the coding agent can:
  - **List** available Work Orders (filter by project, status, assignee, phase)
  - **Pull** a specific Work Order with full embedded context (spec section content, Software Definition, acceptance criteria, related work orders)
  - **Update status** of a Work Order (Backlog → In Progress → In Review → Done)
  - **Post a note** back to a Work Order (e.g. implementation decisions, blockers)

### 17.3 What the Agent Receives on Pull
When a Work Order is pulled via MCP the agent receives a structured payload containing:
- Work Order title, description, acceptance criteria, and phase
- Full content of all linked spec sections
- Software Definition (system prompt)
- Relevant artifact chunks (RAG-retrieved at pull time)
- Links and titles of dependent Work Orders

### 17.4 Security
- MCP API keys are strictly scoped to a single Studio — they cannot access any other Studio's data (Chinese wall enforced at the MCP layer)
- Read-only MCP keys available for Viewer-level access
- Keys can be rotated or revoked by Studio Owners at any time
- All MCP calls are logged and included in the token usage dashboard

---

## 18. Notifications (In-App Inbox)

Atelier maintains a per-user in-app notification inbox. Notifications are written by the system in response to domain events; there is no email delivery in the current version (see §20).

### 18.1 Notification Kinds
| Kind | Trigger | Recipients |
|---|---|---|
| `artifact_embedded` | An uploaded artifact has finished embedding and is ready for RAG | Editors of the artifact's owning scope (project / software / studio) |
| `artifact_deleted` | An artifact was deleted | Editors of the artifact's owning scope |
| `section_updated` | A spec section was edited | Editors of the project (excluding the actor) |
| `publish_commit` | A successful publish completed | Editors of the project (excluding the actor) |
| `draft_unpublished` | Reminder: a spec section has had edits for at least five days that are not yet reflected in the GitLab publish (never published, or the section was updated after the project's last successful publish) | Editors of the project |
| `work_order_status` | A Work Order's status changed | The Work Order's assignee and creator (excluding the actor) |

The actor (the user who triggered the event) is never notified of their own action.

For `draft_unpublished`, rows are written by an optional background job: set `ATELIER_STALE_DRAFT_NOTIFIER=1` to run a daily pass at application startup, or a platform administrator may run `POST /admin/jobs/stale-draft-notifications` on demand.

### 18.2 Inbox UI
- A notification bell in the global header shows an unread count
- Each notification has: kind, title, body, timestamp, and links back to the relevant studio / software / project / section
- Users can mark individual notifications as read or unread, and mark all as read
- Notifications are paginated (cursor-based)
- Notifications are visible to all roles, including Viewers, for events scoped to objects they have access to read

### 18.3 Out of Scope
- Email or push delivery
- Notification preferences and muting
- @mentions in chat

These are tracked under §20 future scope.

---

## 19. Software Activity Log

Each Software maintains an activity feed of significant events — a lightweight audit log scoped to a single Software, distinct from the per-user notification inbox.

### 19.1 What Is Logged
- Project lifecycle events (created, archived, unarchived, deleted)
- Software definition / git config updates
- Other significant administrative changes within the Software

Each entry records:
- Verb (e.g. `project_created`, `project_archived`)
- Actor (user who performed the action)
- Summary text (human-readable one-liner)
- Optional entity reference (entity type and id)
- Timestamp

### 19.2 Visibility
- Viewable by all members of the owning Studio (Owner, Builder, Viewer)
- Cross-studio Externals and Viewers see activity for the Software they have been granted access to
- Read-only — entries are append-only and cannot be edited or deleted by users

### 19.3 Retention
Activity entries are retained indefinitely.

---

## 20. Future Scope (Not in Current Version)
- Unit and regression testing plans
- SSO / OAuth (Google, GitLab login)
- GitHub git integration (current version: self-hosted GitLab only)
- Pre-built outline templates (REST API, microservices, etc.)
- Mobile app
- Per-software or per-project role overrides
- Email / push delivery for notifications, notification preferences, @mentions in chat
- Export to PDF or HTML
- Inline comments / annotations on sections
- Feedback loop / Validator (real-world user feedback → auto work orders)
- AI-generated commit messages
- Rollback UI within the tool
- Work Order dependency graph (manual edges between work orders)
- Auto-apply policy for doc sync (per-section opt-in to skip review)