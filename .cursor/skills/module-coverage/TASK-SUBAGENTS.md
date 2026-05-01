# Module coverage — Task “subagents” (Cursor)

Cursor does **not** expose custom `subagent_type` values. Treat each row below as a **separate Task** invocation: set `subagent_type`, `description`, and paste the `prompt` body (after filling placeholders).

Parent agent: read [SKILL.md](SKILL.md) first (TDD, RBAC, dedupe rules).

| Step | `subagent_type` | `readonly` | Purpose |
|------|-----------------|------------|---------|
| 0 (optional) | `explore` | `true` | Find module files and existing tests |
| 1 | `shell` | — | Scoped coverage + `term-missing` |
| 2 | `generalPurpose` | — | Add or merge tests from gap list |
| 3 | `shell` | — | Re-run scoped coverage + full `pytest` / `npm test` |

Placeholders:

- `REPO_ROOT` — e.g. `c:\Repo\Atelier`
- `BACKEND_IMPORT` — dotted path under `app`, e.g. `app.routers.graph`
- `FRONTEND_GLOB` — path under `src/`, e.g. `src/services/api.ts` or repeated `--coverage.include=...`
- `USER_GOAL` — one sentence (e.g. “raise coverage on graph router without duplicating RBAC tests”)

---

## 0 — Explore (optional)

**Task fields**

- `subagent_type`: `explore`
- `readonly`: `true`
- `description`: `Map module and tests for coverage target`

**Prompt**

```text
Read-only recon for Atelier at REPO_ROOT.

Goal: USER_GOAL

Backend target import path: BACKEND_IMPORT (if applicable). Map:
- Files under backend/app/ that correspond to that import path
- Existing tests under backend/tests/unit and backend/tests/integration that import or reference that module (rg for the module name, route paths, service names)

Frontend target (if applicable): FRONTEND_GLOB under frontend/src/. Map:
- Matching source files
- Co-located *.test.ts / *.test.tsx and any MSW handlers

Return: bullet list of file paths to measure in Phase 1 and test files most likely to extend (no code edits).
```

---

## 1 — Shell: measure coverage

**Task fields**

- `subagent_type`: `shell`
- `description`: `pytest/vitest scoped coverage term-missing`

**Prompt — backend**

```text
Repo: REPO_ROOT. Use PowerShell; chain with `;` not `&&` where needed.

cd REPO_ROOT\backend
pytest tests/unit tests/integration -q --cov=BACKEND_IMPORT --cov-report=term-missing --cov-report=xml:coverage-module.xml

Paste the full term-missing section for files under that package only. Note: integration tests need PostgreSQL per backend/tests/conftest.py (TEST_DATABASE_URL, default 127.0.0.1:5433).

Do not commit coverage-module.xml.
```

**Prompt — frontend**

```text
Repo: REPO_ROOT. PowerShell.

cd REPO_ROOT\frontend
npm run test:coverage -- --coverage.include=FRONTEND_GLOB

(For multiple globs, repeat --coverage.include= for each pattern.)

Paste the coverage summary and any uncovered-line hints for the included files only.
```

---

## 2 — generalPurpose: close gaps (TDD)

**Task fields**

- `subagent_type`: `generalPurpose`
- `description`: `Tests for module coverage gaps`

**Prompt**

```text
Work in REPO_ROOT. Follow .cursor/rules/atelier-cursor-rules.mdc and the module-coverage skill at .cursor/skills/module-coverage/SKILL.md.

Goal: USER_GOAL

You have (or re-run Step 1): scoped coverage output for BACKEND_IMPORT and/or FRONTEND_GLOB.

Phase B: From term-missing / report, list gaps for the requested module only. Classify: happy path, 401/403/cross-studio, 422, 404. Skip lines not worth covering (TYPE_CHECKING, etc.) with brief justification.

Phase C:
- Backend: tests in backend/tests/unit or backend/tests/integration; RBAC via FastAPI dependencies only; thin routers.
- Frontend: co-located tests; MSW; api.ts only; privileged UI absent from DOM for viewer case.

Phase D: Search for duplicate scenarios (same route, error code, component case). Prefer parametrize / shared fixtures; merge or delete weaker duplicates without dropping the last matrix cell for RBAC.

Implement until the same scoped coverage command from Step 1 shows acceptable coverage for the target module.

Return: files changed, brief note on dedupe decisions, any follow-up for the verify step.
```

---

## 3 — Shell: verify

**Task fields**

- `subagent_type`: `shell`
- `description`: `Re-run scoped coverage and full test suites`

**Prompt**

```text
Repo: REPO_ROOT. PowerShell.

Re-run the exact scoped coverage command from Step 1 for BACKEND_IMPORT or FRONTEND_GLOB and confirm no regressions.

Then full suites:
cd REPO_ROOT\backend; pytest tests/unit tests/integration -q
cd REPO_ROOT\frontend; npm test

Paste exit codes and any failures. Do not commit coverage artifacts.
```

---

## Parent one-liner (serial Tasks)

Use when you drive the sequence yourself:

1. Task `explore` (optional) with prompt from §0  
2. Task `shell` with §1  
3. Task `generalPurpose` with §2 (paste Step 1 output into the prompt or tell the agent to re-run Step 1)  
4. Task `shell` with §3  

Replace placeholders before sending each Task.
