# Atelier — Functional Requirements
_Version 2.2 — Studio Viewer home role; standardised role labels (Owner/Builder/Viewer/External); Software Definition edit gating clarified; in-app notifications, budgets, project archival, artifact library, software-wide chat, per-studio LLM routing, slash commands, publish folder slug, software activity log, admin user provisioning, work-order status notifications_

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
| View issues | ✅ | ✅ | ✅ (own triggers + own publish) | ❌ | ✅ (own triggers only) | ❌ |
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
- A registry of providers and the model IDs each provider exposes (provider key, display name, list of model IDs, optional API base URL, status)
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

- Studio Owner can archive or unarchive any Project in their Studio
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

**Editor selection as context.** When the editor has an active selection, the composer can include the selection (offsets and excerpt) as a "selected excerpt" block in the LLM context, so the model can answer scoped to that selection.

**Patch proposal.** For commands whose intent is to modify the section (`/append`, `/replace`, `/edit`, and `/improve`), the server may return a structured `patch_proposal` after the streamed reply. The client displays the proposed change as a preview; the user must explicitly **Apply** before any change is written into the collaborative editor. No silent auto-apply.

### 10.5 Smart Context Assembly
Every LLM message assembles context within a configurable token budget:

| Priority | Content | Rule |
|---|---|---|
| 1 | Software Definition | Always included — summarised if over 500 tokens |
| 2 | Project outline (section titles only) | Always included as a brief summary |
| 3 | Current section (full content) | Always included — truncated as last resort (see below) |
| 4 | Other spec sections | Retrieved by semantic relevance to the user's message |
| 5 | Artifact chunks | Retrieved by semantic relevance to the user's message |
| 6 | Git history | Only included when explicitly requested by the user |

Sections and artifact chunks beyond the token budget are trimmed by relevance score. Users never manage this manually.

**Overflow fallback strategy** — applied in order if mandatory items (1–3) alone exceed the token budget:

1. **Summarise the Software Definition** — if the Software Definition exceeds 500 tokens, the LLM generates a compressed summary to use in its place (cached per session)
2. **Truncate the current section from the bottom** — the current section is trimmed from the end, preserving at least the first 20% of its content (the opening context is most important for the LLM)
3. **UI warning banner** — if priorities 1–3 still exceed the budget after steps 1 and 2, a warning banner is shown to the user: "This section is very large — some content was trimmed from context. Consider splitting this section into smaller parts."
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
- Studio Viewers and cross-studio Viewers do not see the Issues Panel

### 15.4 Issue Management
- Each issue shows: affected section(s), conflict/gap description, status (Open / Resolved)
- Any member who can see an issue can mark it Resolved
- Resolved issues remain in history for audit purposes
- Issues appear as nodes in the Knowledge Graph linked to their affected sections

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
- Reverse-engineering spec from existing codebase ("Backprop")
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