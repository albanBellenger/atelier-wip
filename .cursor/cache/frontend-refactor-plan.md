# Frontend refactor — Phase B plan

## B1. Dependency removals

| Package | Phase A class | Action |
|---------|---------------|--------|
| *(none)* | No `unused` packages | **No `npm uninstall` in Phase D** unless a later audit finds dead code. |

**Needs human confirmation:** `react-router-dom` lives under `devDependencies` but is runtime-critical — recommend a follow-up MR to move it to `dependencies` for npm semantics; not a removal.

---

## B2. Refactor batches (independent, ≤5 source files per batch)

### Batch 1 — **low** — Persisted section layout hook
- **Files:** `src/hooks/usePersistedSectionLayoutMode.ts` (new), `src/hooks/usePersistedSectionLayoutMode.test.tsx` (new), `src/pages/SectionPage.tsx`.
- **Goal:** Move `localStorage` read/write for `atelier:sectionLayout:*` out of `SectionPage` into a testable hook.
- **Tests must stay green:** `src/pages/SectionPage.test.tsx`.
- **New tests:** Hook unit tests via `renderHook`.
- **Risk:** low.

### Batch 2 — **medium** — Status pill consolidation *(deferred after Batch 1)*
- **Files:** `components/ui/SectionStatusPill.tsx` (or `StatusPill.tsx`), `OutlineNav.tsx`, `ProjectOutlineCard.tsx`, `ProjectPage.tsx`, related tests.
- **Goal:** Single pill component for section/workspace landing statuses.
- **Risk:** medium (multiple call sites + visual tests).

### Batch 3 — **high** — *(final / careful)* CopilotPanel / Yjs split
- **Files:** `CopilotPanel.tsx` + siblings — only after hooks `useYjsCollab` / `useStream` have dedicated tests.
- **Risk:** high — RBAC, streaming, Yjs.

---

## B3. Coverage gap closure (first ≤10 files below 80% lines)

Priority order per prompt: hooks → services → high-traffic components.

| File | Baseline % | Scenarios to add |
|------|------------|------------------|
| `hooks/useYjsCollab.ts` | 0 | mock Y.Doc + provider; cleanup on unmount; error path if any |
| `hooks/useStream.ts` | 66.7 | success chunk, error, abort |
| `services/api.ts` | 7.8 | MSW: representative GET/POST + 401/422 parsing |
| `services/ws.ts` | 14 | connect mock, message handler, reconnect guard |
| `services/privateThreadSse.ts` | 0 | parse events / teardown |
| `components/chat/ChatRoom.tsx` | 3.1 | render with mocked thread; viewer gated send |
| `components/graph/KnowledgeGraph.tsx` | 7.4 | empty graph, node click smoke |
| `components/outline/OutlineNav.tsx` | 48.1 | expand/collapse, drag disabled for viewer |
| `components/thread/CopilotTabs.tsx` | 54.8 | tab switch, disabled tab |
| `components/tokenUsage/LlmUsageFilterBar.tsx` | 34 | date preset change, validation toast |

**MAX_ITERATIONS for coverage push:** 5 (per test-coverage skill); stop if stall &lt; +0.5% over two runs.

---

## Present to user (per prompt §4)

- **High-risk batches** are deferred to Batch 3+ (`CopilotPanel` / Yjs).
- **No uncertain dependency removals** in Phase D.
