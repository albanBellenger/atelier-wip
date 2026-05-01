---
name: module-coverage
description: >-
  Run module-scoped test coverage for Atelier backend (pytest-cov) or frontend
  (Vitest v8), close gaps with TDD-compliant tests, and dedupe overlapping tests.
  Use when the user asks for coverage of a specific app package, router, service,
  or frontend path under src/.
---

# Module-scoped coverage workflow

Atelier enforces TDD and RBAC; follow [`.cursor/rules/atelier-cursor-rules.mdc`](../../rules/atelier-cursor-rules.mdc). Repo-wide targets: backend line coverage gate **≥90%**; frontend components **≥80%** in architecture docs—per-module work may push higher but **100% on every line is not required** (e.g. `TYPE_CHECKING`, unreachable defensive branches); document intentional exclusions.

## Subagent orchestration (Cursor Task)

Cursor does not allow registering new `subagent_type` values. Use the **Task** tool:

| Phase | `subagent_type` | Role |
|-------|-----------------|------|
| Optional recon | `explore` (readonly) | Map `backend/app/...` or `frontend/src/...` and locate existing tests if unclear |
| A–B | `shell` | Run coverage commands; capture `term-missing` / HTML output; list gaps |
| C–D | `generalPurpose` **or** parent Agent | Author or refactor tests; merge duplicates |
| Verify | `shell` | Re-run scoped coverage + full `pytest` / `npm test` |

Give the subagent **concrete paths**: import path or `src/...` glob, and workspace root `c:\Repo\Atelier` (or current repo root).

---

## Inputs

**Backend — pick one:**

- **Import path** (preferred for `--cov`): dotted path under `app`, e.g. `app.collab.server`, `app.routers.graph`.
- **Filesystem path**: e.g. `backend/app/collab/server.py` → convert to import: `app.collab.server` (strip `backend/`, strip `.py`, replace `/` with `.`).

**Frontend:**

- Glob under `frontend/src/`, e.g. `src/services/api.ts`, `src/components/graph/**/*.{ts,tsx}`.

Vitest 3.2 allows **repeated** `--coverage.include` for multiple globs (`npx vitest run --help --coverage`).

---

## Phase A — measure (`shell`)

### Backend (from `backend/`)

Integration tests expect PostgreSQL test DB; see [`backend/tests/conftest.py`](../../../backend/tests/conftest.py) (`TEST_DATABASE_URL`, default `127.0.0.1:5433`).

PowerShell-friendly (use `;` to chain `cd`, not `&&` on older hosts):

```powershell
cd c:\Repo\Atelier\backend
pytest tests/unit tests/integration -q --cov=app.MODULE --cov-report=term-missing --cov-report=xml:coverage-module.xml
```

Replace `app.MODULE` with the target, e.g. `--cov=app.collab.server` or `--cov=app.schemas.graph` (package or submodule as needed). `coverage-module.xml` is gitignored via `.cursorignore` / project ignores—do not commit.

To scope **which tests run** (faster feedback), add `-k` or a path to a test file—but then coverage only reflects executed code; for a fair module picture prefer running the full unit+integration set when feasible.

### Frontend (from `frontend/`)

Vitest **v3.2.4** flags (verified via `npx vitest run --help --coverage`):

- `--coverage` — enable collection
- `--coverage.include <pattern>` — glob for files **included in the report**; repeat flag for multiple patterns

Example:

```powershell
cd c:\Repo\Atelier\frontend
npm run test:coverage -- --coverage.include=src/services/api.ts
```

Multiple includes:

```powershell
npm run test:coverage -- --coverage.include=src/foo/*.ts --coverage.include=src/foo/*.tsx
```

Optional: `npm run test:coverage:module -- --coverage.include=src/...` (script enables coverage with `reportOnFailure`; see [`frontend/package.json`](../../../frontend/package.json)).

HTML report: `frontend/coverage/index.html` (default `coverage.reportsDirectory`).

---

## Phase B — gap analysis (`shell` or parent)

From **term-missing** output or HTML:

1. List **files and line ranges** missing in the requested module only.
2. Classify each gap: happy path, error handling, **401 / 403 / cross-studio**, **422**, **404**—integration tests should cover this matrix per project rules.
3. Note branches that are **not worth** covering (justify briefly).

---

## Phase C — tests (`generalPurpose` or parent Agent)

- **Backend:** new tests under [`backend/tests/unit/`](../../../backend/tests/unit/) or [`backend/tests/integration/`](../../../backend/tests/integration/) as appropriate. Use FastAPI **dependencies** for RBAC; never ad-hoc role checks in routers.
- **Frontend:** co-locate `*.test.ts(x)`; **MSW** for HTTP; **no `fetch` in components**—use [`frontend/src/services/api.ts`](../../../frontend/src/services/api.ts). Every component test includes a **viewer cannot perform privileged action** case (assert element absent from DOM, not CSS-hidden).

Prefer **extending** existing test files over new ones when the scenario fits.

---

## Phase D — deduplicate tests (mandatory)

Before adding a new `test_*.py` or a new top-level `describe`:

1. **Search** the repo (`rg`, IDE) for the same **route path**, **handler name**, **error code**, or **component scenario**.
2. Prefer **`@pytest.mark.parametrize`** or shared fixtures over copy-pasted cases.
3. If two tests prove the **same behaviour**: **merge or delete** the weaker one; keep the **integration** test over a redundant shallow duplicate when both hit the same branch.
4. After merges, ensure the **RBAC matrix** (missing auth, wrong role, cross-studio, invalid input, not found) is still covered **once** where required—do not delete the last test for a matrix cell.

---

## Verification (`shell`)

1. Re-run the **same** scoped coverage command from Phase A.
2. Run full suites from repo expectations:

```powershell
cd c:\Repo\Atelier\backend
pytest tests/unit tests/integration -q

cd c:\Repo\Atelier\frontend
npm test
```

---

## Copy-paste Task prompts (parent agent)

**Shell — backend coverage**

```text
In repo Atelier, cwd backend/. Run pytest tests/unit tests/integration with --cov=IMPORT_PATH --cov-report=term-missing --cov-report=xml:coverage-module.xml. Paste full term-missing for files under that package only. Note DB: TEST_DATABASE_URL / conftest defaults.
```

**Shell — frontend coverage**

```text
In repo Atelier, cwd frontend/. Run: npm run test:coverage -- --coverage.include=GLOB
Paste coverage table and any uncovered lines summary. Use PowerShell-safe commands.
```

Replace `IMPORT_PATH` / `GLOB` with user-provided values.

## Ready-made Task prompts

For copy-paste **Task** bodies per phase (`explore` / `shell` / `generalPurpose`), see [TASK-SUBAGENTS.md](TASK-SUBAGENTS.md).
