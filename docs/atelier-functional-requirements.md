# Atelier — Functional Requirements
_Version 2.1 — fixed Tool Admin SPOF, External Editor role, issue visibility, context overflow, Work Order export, Knowledge Graph clustering_

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
- Any authenticated user can create a Studio and becomes its Admin
- A Studio has a name, description, and optional logo
- The creating user is the first Studio Admin

### 3.3 Cross-Studio Access
- A Studio Admin can request access to a specific Software owned by another Studio
- The request is approved or rejected by the **Tool Admin** (not the other Studio's Admin)
- Approved access grants read-only (**Viewer**) access by default
- The Tool Admin can upgrade the grant to edit access (**External Editor**) if explicitly requested
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

### 4.2 Role Hierarchy

Roles cascade down the hierarchy. A higher role at a parent level implies the same or greater access at all child levels within that scope.

#### Tool Level
| Role | Description |
|---|---|
| **Tool Admin** | Full access to everything — all studios, all software, all config. Approves cross-studio access requests. Configures LLM/embedding provider. Views token usage across all studios. |

#### Studio Level
| Role | Description |
|---|---|
| **Studio Admin** | Manages the studio — creates software, invites/removes members, requests cross-studio access, manages git config and MCP keys. Sees all software and projects within the studio. |
| **Studio Member** | Works within any software and project in their studio. Can edit specs, create work orders, upload artifacts, run analysis, and publish. Cannot manage members or create software. |

#### Cross-Studio Access (special cases)
| Role | Description |
|---|---|
| **Viewer** | Read-only access to a specific Software in another Studio. Can view specs, work orders, artifacts, and the knowledge graph. Cannot edit, create, chat, or publish. |
| **External Editor** | Edit-level access to a specific Software in another Studio, granted explicitly by Tool Admin. Can edit spec sections, create and edit Work Orders, upload artifacts, use private LLM threads and project chat, and run conflict analysis. Cannot publish, manage members, configure git, manage MCP keys, or edit the Software Definition. Scoped strictly to the granted Software — no access to other Software in the target Studio. |

### 4.3 Permission Matrix

| Action | Tool Admin | Studio Admin | Studio Member | External Editor | Viewer |
|---|---|---|---|---|---|
| Configure LLM / embedding | ✅ | ❌ | ❌ | ❌ | ❌ |
| View all-studio token usage | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve cross-studio access | ✅ | ❌ | ❌ | ❌ | ❌ |
| Promote / revoke Tool Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / delete Studio | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Manage Studio members | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Request cross-studio access | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage MCP API keys | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Create Software | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Software Definition | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Configure git integration | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Create Project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Project outline | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit spec sections | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Upload / delete artifacts | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Create / edit Work Orders | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Update Work Order status | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Generate Work Orders (LLM) | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Use private LLM thread | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Use project chat | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Run conflict / gap analysis | ✅ | ✅ | ✅ | ✅ (granted software only) | ❌ |
| Publish to git | ✅ | ✅ | ✅ | ❌ | ❌ |
| View spec / Work Orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Knowledge Graph | ✅ | ✅ | ✅ | ✅ | ✅ |
| View artifacts | ✅ | ✅ | ✅ | ✅ | ✅ |
| View issues | ✅ | ✅ | ✅ (own triggers + own publish) | ✅ (own triggers only) | ❌ |
| View token usage (own) | ✅ | ✅ (studio) | ✅ (self) | ✅ (self) | ❌ |

---

## 5. Admin Configuration

- The Tool Admin panel is accessible to all users with Tool Admin role
- Any Tool Admin can promote another registered user to Tool Admin, or revoke Tool Admin status from another Tool Admin (self-revocation is blocked)
- Tool Admins configure the LLM and embedding provider for the entire tool:
  - LLM provider (e.g. OpenAI, Anthropic, Azure), model name, API key
  - Embedding provider, model name, API key
- Configuration applies globally to all studios
- Changes take effect immediately (no restart required)
- All Tool Admins can view token usage across all studios

---

## 6. Software

### 6.1 What Software Is
A Software represents a product or system being built within a Studio — e.g. "Customer Portal", "Inventory API", "Mobile App". It is the container for all Projects, specs, artifacts, work orders, and issues related to that product.

### 6.2 Creating Software
- Studio Admins can create Software within their Studio
- Each Software has a name, description, and a **Software Definition** — a free-text instruction that shapes LLM behaviour across all projects within it (domain language, tech stack, architectural constraints, compliance requirements)
- Only Studio Admins can edit the Software Definition
- The Software Definition is always the first item in every LLM context window within this Software
- Git integration is configured at the Software level (one repo per Software)

### 6.3 Git Integration (Studio Admin only)
- Git provider: **self-hosted GitLab only** (GitHub support planned for a future phase)
- GitLab instance URL, personal access token (stored encrypted), target branch
- "Test Connection" validates the token and repo before saving

---

## 7. Projects

### 7.1 What a Project Is
A Project is a scoped workstream within a Software — e.g. "v2.0 Redesign", "Payment Module", "Mobile MVP". It contains the structured spec outline, sections, chat room, work orders, and issues for that workstream.

### 7.2 Creating a Project
- Studio Admins and Studio Members can create Projects within a Software
- Each Project has a name and optional description
- All Studio Members have equal access — no per-project ownership

### 7.3 Structured Outline
- Studio Admin defines the Project outline from scratch (list of named sections)
- Each section maps to one `.md` file in the final git output (e.g. `data-model.md`)
- Studio Admin can add, rename, reorder (drag and drop), and delete sections
- All Studio Members can navigate and edit all sections

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
- Any Studio Member can upload artifacts to a Project
- Supported types: PDF, Markdown (`.md`)
- Members can also create new Markdown artifacts directly in the tool via an in-app editor
- All artifacts are listed, viewable, and downloadable by all Studio Members and Viewers
- Any Studio Member can delete an artifact

### 9.2 Artifact Role in LLM Context
- All artifacts are chunked and embedded for RAG on upload
- Relevant chunks are automatically retrieved per LLM message — no manual referencing needed
- Viewers can download artifacts but artifact content is not included in their LLM context (they have read-only access, no LLM interaction)

---

## 10. LLM Interaction

### 10.1 Private Thread (per user, per section)
- Each Studio Member has a private LLM conversation scoped to a specific section
- Not visible to other participants
- LLM helps write, refine, and improve section content
- LLM has access to the full smart context (Software Definition, project outline, current section, relevant other sections, relevant artifact chunks)
- Optional **editor selection** may be sent with each message (offsets + excerpt): when enabled, it is injected into context as a short “selected excerpt” block so the model can answer in Cursor-like selection scope
- LLM automatically flags conflicts and gaps inline at the end of every response
- Optional **thread intent** (`ask`, `append`, `replace_selection`, `edit`): after the streamed reply, the server may return a structured **`patch_proposal`** in the stream metadata; the client shows a preview and the user must **confirm (Apply)** before any change is written to the collaborative editor (no silent auto-apply)
- Members can start a new thread (clear history) at any time
- Responses stream token by token

### 10.2 Shared Project Chat Room
- One persistent chat room per Project, visible to all Studio Members
- Any member can send messages; all members see LLM responses streamed live simultaneously
- LLM has full project context in this room
- Chat history is persistent and paginated (infinite scroll upward)

### 10.3 Smart Context Assembly
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
- Assignee (optional, any Studio Member)
- Phase (for sequencing)
- Links to originating spec sections
- Implementation guidance (LLM-generated or manually written)
- Acceptance criteria
- Embedded upstream context (relevant spec excerpts auto-included when pulled via MCP)

### 11.2 Creating Work Orders

**Auto-generation:** any Studio Member can select one or more spec sections and trigger LLM-based Work Order generation. The LLM reads the section content and decomposes it into discrete, implementable tasks, each with a title, description, implementation guidance, and acceptance criteria.

**Manual creation:** any Studio Member can create a Work Order from scratch, or edit any auto-generated one.

Work Orders are always linked to at least one spec section.

### 11.3 Work Order Lifecycle
- Sequenced into phases via drag-and-drop (e.g. Phase 1 — Foundation, Phase 2 — Core Features)
- Status transitions: Backlog → In Progress → In Review → Done → Archived
- Any Studio Member can update status and assignee
- When a linked spec section changes significantly, the Work Order is automatically flagged **Potentially Stale** (drift detection — see Section 14)

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
- Viewers and External Editors have read-only access to the graph

**Clustering (for large projects):**
- By default, nodes are grouped into clusters by node type (Sections cluster, Work Orders cluster, Artifacts cluster, Issues cluster) to prevent hairball rendering
- Work Orders are additionally sub-clustered by Phase within their cluster
- Users can expand or collapse any cluster by clicking it
- Individual nodes become visible on cluster expand
- Edges between clusters are shown as aggregated bundle edges (e.g. "12 relationships") until expanded
- A cap of **150 visible nodes** is enforced at any time — when exceeded, the graph shows clusters only and prompts the user to filter (by phase, section, or status) before expanding
- Filter controls on the graph panel: filter by node type, phase, status (Work Orders), and stale/conflicted flag

---

## 13. Token Usage Dashboard

### 13.1 Purpose
LLM token costs are tracked as a first-class concern — not an afterthought — to give full visibility into AI usage and cost across the tool.

### 13.2 What Is Tracked
- Token usage broken down by: Studio, Software, Project, user, and agent call type (private thread, project chat, Work Order generation, conflict analysis, drift detection, Knowledge Graph analysis)
- Estimated cost in USD based on the configured provider's pricing
- Usage trend over time (daily / weekly / monthly views)

### 13.3 Access Levels
- Tool Admin: sees all studios, all software, all users
- Studio Admin: sees their own studio only (all software, all members)
- Studio Member: sees their own usage only

### 13.4 Export
- CSV export of usage data filterable by studio, software, project, user, date range, and call type

---

## 14. Drift Detection

### 14.1 What It Does
When a spec section changes, the system automatically checks whether any linked Work Orders have been invalidated by the change — keeping the spec and the execution plan in sync.

### 14.2 How It Works
- On every section save (debounced), the LLM compares the new section content against the description and acceptance criteria of all linked Work Orders
- If a significant divergence is detected, the Work Order is flagged **Potentially Stale** with a brief explanation of what changed
- The stale flag is visible on the Work Order card, in the Kanban board, in the list view, and in the Knowledge Graph (highlighted node)

### 14.3 Resolution
- Any Studio Member can dismiss the flag (marking the Work Order as reviewed and still valid)
- Or edit the Work Order to bring it back into alignment with the updated spec
- Dismissals are logged for audit (who dismissed, when)

---

## 15. Conflict & Gap Detection (Issues Panel)

### 15.1 When It Runs
- **Automatically** on every publish to GitLab
- **Manually** at any time via "Run Analysis" button (any Studio Member)

### 15.2 What It Checks
- Each pair of spec sections: contradictions or conflicts
- Each section individually: obvious missing information for a software specification
- Previous auto-generated open issues are cleared before each new run (no duplicates)

### 15.3 Who Sees Results
- Studio Admins always see all issues in the Issues Panel
- Studio Members and External Editors see issues if they triggered the analysis run **or** if they triggered the publish that caused the auto-analysis
- This means: if a Studio Member publishes, they see all issues generated by that specific publish event, in addition to any issues from manual analysis runs they triggered
- Auto-publish issues from publishes triggered by someone else are visible to Studio Admins only

### 15.4 Issue Management
- Each issue shows: affected section(s), conflict/gap description, status (Open / Resolved)
- Any member who can see an issue can mark it Resolved
- Resolved issues remain in history for audit purposes
- Issues appear as nodes in the Knowledge Graph linked to their affected sections

---

## 16. Publishing & Version History

### 16.1 Publishing
- Any Studio Member can trigger a publish
- On publish:
  - All sections compiled into a structured folder of `.md` files (one per section, named by slug)
  - A `README.md` generated with project name and outline table of contents
  - **Active Work Orders only** (Backlog, In Progress, In Review) exported as structured Markdown in a `/work-orders/` subfolder — Done and Archived Work Orders are excluded
  - Files committed to the configured self-hosted GitLab repository
  - Conflict detection runs automatically — the user who triggered the publish sees the resulting issues (see Section 15.3)
  - Drift detection runs on all active Work Orders
- Optional custom commit message; if omitted, one is auto-generated
- On success: commit URL shown as a clickable link

### 16.2 Version History
- Readable commit timeline per Software (message, author, timestamp, link to GitLab)
- Users view and compare past commits directly on GitLab
- Users never interact with git directly

---

## 17. MCP Integration (Coding Agent Bridge)

### 17.1 What It Is
Atelier exposes an MCP (Model Context Protocol) server so that coding agents — Cursor, Claude Code, or any MCP-compatible IDE — can pull Work Orders and their full embedded context directly from the tool without leaving the editor.

### 17.2 How It Works
- Studio Admins generate scoped MCP API keys for their Studio (per-developer keys recommended)
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
- Keys can be rotated or revoked by Studio Admins at any time
- All MCP calls are logged and included in the token usage dashboard

---

## 18. Future Scope (Not in Current Version)
- Unit and regression testing plans
- Reverse-engineering spec from existing codebase ("Backprop")
- SSO / OAuth (Google, GitLab login)
- GitHub git integration (current version: self-hosted GitLab only)
- Pre-built outline templates (REST API, microservices, etc.)
- Mobile app
- Per-software or per-project role overrides
- Notification system (email alerts, @mentions in chat)
- Export to PDF or HTML
- Inline comments / annotations on sections
- Feedback loop / Validator (real-world user feedback → auto work orders)
- AI-generated commit messages
- Rollback UI within the tool
- Work Order dependency graph (manual edges between work orders)