---
name: atelier-test-coverage
description: >-
  Reviews the Atelier test suite (unit, integration, LLM) against the technical
  architecture and functional requirements, identifies coverage gaps, implements
  missing tests, and iterates in a bounded loop until backend line coverage ≥90%
  and frontend ≥80%. E2E (Playwright) is explicitly out of scope. Use when the
  user asks to review test coverage, fix test gaps, improve test coverage, audit
  tests, add missing tests, or mentions coverage thresholds.
---

# Atelier — Test Coverage Audit & Gap Closure

Follow [`.cursor/rules/atelier-cursor-rules.mdc`](../../rules/atelier-cursor-rules.mdc) for TDD and project conventions.

You are running a **recursive, bounded** workflow to bring the Atelier test suite up to the coverage targets defined in the technical architecture (§17): **≥ 90% backend line coverage**, **≥ 80% frontend line coverage**, with comprehensive coverage across the **unit / integration / LLM** levels.

**E2E (Playwright) tests are out of scope.** Do not create, modify, run, or report on anything under `frontend/e2e/`, `tests/e2e/`, or files matching `*.spec.ts` that target Playwright. If you encounter E2E tests during analysis, list them as "skipped — out of scope" and move on.

---

## Hard rules (non-negotiable)

1. **Bounded recursion.** This workflow has a `MAX_ITERATIONS = 5` hard cap. Track the iteration counter in a scratch file at `.cursor/cache/test-coverage-state.json`. Stop when **either** coverage targets are met **or** `MAX_ITERATIONS` is reached. Never loop without a counter.
2. **Stop on regression.** If an iteration produces lower coverage than the previous iteration, or a previously-passing test now fails, **halt immediately** and surface the regression to the user. Do not continue mutating the suite.
3. **Stop on stall.** If two consecutive iterations produce a coverage delta of less than `+0.5%`, halt and report which modules resist coverage and why.
4. **Never delete or weaken existing assertions** to make tests pass. If an existing test is wrong, flag it for the user — do not silently rewrite it.
5. **Tests written must be runnable, not stubs.** Every test added must actually exercise the code path. `pytest.skip` and `it.skip` are forbidden as gap-closure mechanisms.
6. **LLM tests cost money.** Never run `pytest -m llm` automatically as part of the loop. Generate them, mark them with `@pytest.mark.llm`, and report which LLM tests were added — but leave invocation to the nightly CI / the user.

---

## Inputs to verify before starting

Before starting, verify these exist in the repo. If any are missing, halt and ask the user where they live:

- `backend/app/` — FastAPI service code
- `backend/tests/{unit,integration,llm}/` — existing test tree
- `backend/requirements-test.txt` — test deps (pytest, pytest-asyncio, pytest-cov, httpx, respx, factory-boy, faker)
- `backend/pytest.ini` or `pyproject.toml` with `[tool.pytest.ini_options]` defining the `llm` marker
- `frontend/src/` — React source
- `frontend/src/tests/` — Jest + RTL tests, MSW handlers
- `frontend/jest.config.*` or equivalent
- `atelier-technical-architecture.md` and `atelier-functional-requirements.md` at the repo root or in a `docs/` folder — these define the **expected** coverage surface

If the repo structure differs from §17.3 / §17.5 of the architecture doc, **adapt to the actual layout** rather than imposing the doc's layout. Coverage of real code matters more than directory aesthetics.

---

## The loop

```
┌─────────────────────────────────────────────────────────────┐
│  iteration N (N ≤ 5)                                         │
│                                                              │
│  1. MEASURE   — run coverage, parse results                  │
│  2. ANALYZE   — diff measured coverage vs expected surface   │
│  3. PRIORITIZE — rank gaps by impact                         │
│  4. IMPLEMENT — write the next batch of tests (≤ 10/iter)    │
│  5. VALIDATE  — run only the new + adjacent tests, then full │
│  6. RECORD    — append to state file, decide continue/stop   │
└─────────────────────────────────────────────────────────────┘
```

### Step 1 — MEASURE

Run the suites that are in scope. Capture both backend and frontend coverage, structured.

**Backend:**
```bash
cd backend
pytest tests/unit tests/integration \
  --cov=app \
  --cov-report=term-missing \
  --cov-report=json:coverage.json \
  --cov-report=xml:coverage.xml \
  -m "not llm" \
  --tb=short \
  -q
```

**Frontend:**
```bash
cd frontend
npm test -- --coverage --watchAll=false --ci \
  --coverageReporters=json-summary \
  --coverageReporters=text \
  --testPathIgnorePatterns="e2e"
```

Read `backend/coverage.json` (per-file `summary.percent_covered` and `missing_lines`) and `frontend/coverage/coverage-summary.json` (per-file `lines.pct`). If either command fails with a setup error (missing service, migration not run), fix the setup error first — do not proceed to analysis on broken data.

For LLM tests, **do not execute** them. Instead, statically inventory `backend/tests/llm/` — list each test file, the function signatures, and the `@pytest.mark.llm` markers present.

### Step 2 — ANALYZE — build the gap matrix

Compare measured coverage against the **expected surface** derived from the architecture. The expected surface for Atelier (per §17.4 of the architecture) covers, at minimum:

**Backend unit tests** (mocked dependencies, pure logic):

| Service / util            | Must cover                                                                                       |
|---------------------------|--------------------------------------------------------------------------------------------------|
| `rag_service`             | token budget enforcement, relevance ranking, section ordering, artifact chunk selection          |
| `drift_service`           | prompt construction, YES/NO parsing, stale flag logic (LLM mocked deterministically)             |
| `conflict_service`        | section pair selection, issue deduplication, auto-clear of resolved issues                       |
| `graph_service`           | edge creation, edge deduplication, node assembly for API responses                               |
| `publish_service`         | MD compilation, README generation, work order export format                                      |
| `git_service`             | GitLab API call construction, commit, history, error paths (mocked via `respx`)                  |
| `token_tracker`           | token counting, cost estimation, call-type tagging                                               |
| `rbac`                    | full permission matrix — every role × every action (studio_admin, studio_member, viewer, external_editor, tool_admin) |

**Backend integration tests** (real DB, real HTTP via `httpx.AsyncClient`):

For every route group — `auth`, `studios`, `software`, `projects`, `sections`, `artifacts`, `work_orders`, `threads`, `chat`, `publish`, `issues`, `graph`, `mcp`, `cross_studio`, `token_usage` — verify each test file covers the standard pattern set:

- happy path (correct role, valid data → expected response + DB state)
- auth missing → 401
- wrong role → 403
- Chinese-wall violation (cross-studio without access) → 403
- invalid data → 422
- not found → 404
- cascade deletes (delete parent → all children gone)

Treat any missing pattern as a gap. Do not require all seven for resources where a pattern is logically inapplicable (e.g., 422 is meaningless for a route with no body) — note the exemption in your report.

**Backend LLM tests** (`@pytest.mark.llm`, real provider):

| File                              | Must cover                                                                  |
|-----------------------------------|-----------------------------------------------------------------------------|
| `test_work_order_generation.py`   | structured output shape: `title`, `description`, `acceptance_criteria`, `implementation_guide`, `status="backlog"`; semantic relevance to source section |
| `test_conflict_detection.py`      | conflict surfaces between contradictory sections; issue shape (description, status="open") |
| `test_drift_detection.py`         | stale flag flips when linked section diverges from work order               |
| `test_rag_context_assembly.py`    | token budget respected (input_tokens ≤ budget + small overhead)             |

LLM test assertions check **schema shape and semantic relevance**, never string lengths or JSON parsing — those are guaranteed by the `LLMService.chat_structured` contract.

**Frontend unit tests** (Jest + RTL + MSW):

| Surface                            | Must cover                                                                |
|------------------------------------|---------------------------------------------------------------------------|
| Hooks (`useAuth`, `useStream`, `useStudioAccess`, `useWebSocket`) | role-based return values, loading/error states, reconnection logic |
| Services (`api`, `ws`)             | request shaping, error propagation, auth header injection                 |
| Components (KanbanBoard, WorkOrderCard, GenerateWorkOrdersModal, KnowledgeGraph, ChatRoom, ThreadPanel, IssuesPanel, SplitEditor) | renders fixture data, role-gated UI elements (viewer cannot see create buttons), stale badges, empty states |

Build the gap matrix as a table — one row per file in scope, columns for `current_coverage_pct`, `expected_patterns_present`, `expected_patterns_missing`, `priority`.

### Step 3 — PRIORITIZE

Rank gaps by impact, descending:

1. **Critical paths uncovered** — auth, RBAC, Chinese-wall enforcement, cascade deletes. Security-relevant code first.
2. **Files below 50% coverage** — biggest absolute-coverage wins per test written.
3. **Missing standard pattern in integration tests** — 401/403/404 paths are easy to add and high-signal.
4. **Service unit tests with no mock for external deps** — these are usually fast wins.
5. **LLM tests for prompts that drive product behavior** — work order generation, conflict, drift.
6. **Frontend role-gated UI assertions** — viewer/editor/admin visibility checks.
7. **Edge cases in well-covered files** — last resort, smallest delta.

Cap the iteration's work at **≤ 10 new test functions** to keep diffs reviewable. If the gap list is longer, the next iteration handles the rest.

### Step 4 — IMPLEMENT

Write the new tests. Apply these patterns:

**Backend unit pattern** (mock external deps, no DB, no network):
```python
# tests/unit/services/test_<service>.py
import pytest
from unittest.mock import AsyncMock
from app.services.<service> import <Service>

@pytest.mark.asyncio
async def test_<behaviour>_<condition>():
    # ARRANGE — fixture inputs, mocked deps
    fake_llm = AsyncMock(return_value={"answer": "YES"})
    service = <Service>(llm=fake_llm)

    # ACT
    result = await service.<method>(<inputs>)

    # ASSERT — behavior, not implementation
    assert result.<field> == <expected>
    fake_llm.assert_awaited_once()
```

**Backend integration pattern** (rolled-back DB transaction, real FastAPI app):
```python
# tests/integration/test_<resource>.py
@pytest.mark.asyncio
async def test_<verb>_<resource>_<role>_<expected>(client, <role_fixture>, <data_fixture>):
    response = await client.<verb>(
        f"/projects/{<data_fixture>['id']}/<resource>",
        json={...},
        headers=<role_fixture>["headers"],
    )
    assert response.status_code == <expected_code>
    # Verify DB side-effects and graph edges where relevant
```

For each integration test file, ensure the seven-pattern grid exists. When adding a missing pattern, copy the file's existing happy-path test as a structural template, then mutate the role/payload/path to trigger the target failure.

**Backend LLM pattern** (`@pytest.mark.llm`, schema + semantic checks only):
```python
@pytest.mark.llm
@pytest.mark.asyncio
async def test_<feature>_produces_valid_structure(client, <role>, <fixture_with_expected_keywords>):
    response = await client.post(<endpoint>, json={...}, headers=<role>["headers"])
    assert response.status_code == 201
    for item in response.json():
        assert isinstance(item["<required_field>"], str) and item["<required_field>"]
        # Semantic relevance — not exact string match
        assert any(kw in item["title"].lower() for kw in <fixture>["expected_keywords"])
```

**Frontend unit pattern** (RTL + MSW):
```typescript
// tests/components/<Area>/<Component>.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { <Component> } from '@/components/<Area>/<Component>'

describe('<Component>', () => {
  it('renders <expected> when <condition>', async () => {
    render(<Component {...props} />)
    expect(await screen.findByText(<expected>)).toBeInTheDocument()
  })

  it('hides <restricted_action> for viewer role', async () => {
    renderWithRole(<Component />, 'viewer')
    expect(screen.queryByRole('button', { name: /<action>/i })).not.toBeInTheDocument()
  })
})
```

**Where to place new files.** Mirror the tested module's path. `app/services/foo.py` → `tests/unit/services/test_foo.py`. New routes → `tests/integration/test_<route_group>.py`. Reuse existing fixtures from `conftest.py` and factories from `tests/factories.py` — do not duplicate.

**Fixtures you may add but should not duplicate**: only add to `conftest.py` if at least two test files would use the fixture. Otherwise keep it module-local.

### Step 5 — VALIDATE

Run the new tests in isolation first to confirm they pass:
```bash
cd backend
pytest <new_test_paths> -v -m "not llm"
```
Then re-run the full in-scope suite to confirm no regression:
```bash
cd backend && pytest tests/unit tests/integration -m "not llm" --cov=app --cov-report=json:coverage.json -q
cd frontend && npm test -- --coverage --watchAll=false --ci --testPathIgnorePatterns="e2e"
```

If a newly-added test fails, **fix the test** (likely a fixture or mock mistake — assume the test is wrong before assuming the code is wrong). Only if the test would pass with reasonable assertions and the code genuinely doesn't satisfy the architecture's contract, surface the discrepancy to the user with: "the architecture says X but the implementation says Y — which is correct?" Do not change production code without explicit approval.

### Step 6 — RECORD & decide

Append a structured record to `.cursor/cache/test-coverage-state.json`:
```json
{
  "iterations": [
    {
      "n": 1,
      "timestamp": "<iso8601>",
      "backend_line_coverage": 78.4,
      "frontend_line_coverage": 71.2,
      "tests_added": [
        {"path": "backend/tests/unit/services/test_rag_service.py", "name": "test_token_budget_enforced_when_artifacts_overflow", "level": "unit"}
      ],
      "files_below_threshold": ["app/services/drift_service.py", "app/utils/rbac.py"],
      "delta_vs_previous": "+6.2"
    }
  ]
}
```

**Decision tree:**

- backend ≥ 90% **AND** frontend ≥ 80% → **STOP. Success.**
- iteration count == `MAX_ITERATIONS` → **STOP.** Report the residual gap.
- delta < +0.5% for two consecutive iterations → **STOP.** Report stall causes.
- any test that previously passed now fails → **STOP.** Report regression.
- otherwise → continue to iteration N+1.

---

## Final report

When the loop terminates (success, cap hit, or stall), produce a single Markdown report with these sections:

1. **Outcome** — `success` / `cap_reached` / `stalled` / `regression_halt` and the final coverage numbers.
2. **What was added** — a flat list of the new test files and functions, grouped by level (unit / integration / LLM). Counts at the top: `+N unit, +M integration, +K LLM tests`.
3. **What is still uncovered** — the residual gap matrix, prioritized. Include file path, current %, missing patterns, suggested next step.
4. **LLM tests added but not executed** — list the `@pytest.mark.llm` tests that need to run in nightly CI. Remind the user the cost implication.
5. **Architecture/implementation discrepancies** — anywhere the spec disagrees with the code; the user must adjudicate.
6. **Suggested next action** — one concrete sentence: e.g., "run iteration 6 manually after fixing the integration DB fixture in `conftest.py:42`" or "merge as-is; coverage targets met."

Keep the report brief — the user wants to know what changed, what's left, and what to do next. No flowery prose.

---

## Out of scope

- Touch any file under `e2e/`, `tests/e2e/`, or any Playwright config (`playwright.config.*`).
- Run `pytest -m llm` (real LLM calls cost tokens — leave to nightly CI).
- Modify production code in `app/` or `src/` (other than imports needed by tests).
- Delete or weaken existing assertions to make a failing test pass.
- Loop more than `MAX_ITERATIONS = 5` times. Ever.
- Auto-commit. The user reviews the diff before any commit happens.
