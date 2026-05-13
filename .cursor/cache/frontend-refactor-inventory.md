# Frontend refactor — Phase A inventory

**2026-05-13 (Milkdown follow-up):** `npm ls` audit: `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/state`, `@codemirror/view`, and `@codemirror/legacy-modes` are **not** direct `package.json` dependencies; they arrive transitively via `@codemirror/merge` (DiffTab), `@codemirror/theme-one-dark`, and `@milkdown/react` → `@milkdown/crepe` / `@milkdown/kit`. `y-codemirror.next` is **not** installed (empty `npm ls`). No unused direct CodeMirror packages were removed — only `@codemirror/merge` + `@codemirror/theme-one-dark` remain as direct CM deps.

Generated as part of the bounded frontend refactor. **Repo:** `c:\Repo\Atelier`. **Note:** `rg` (ripgrep) was not on PATH in the automation shell; dependency hits were verified with workspace search equivalent to `rg` over `frontend/src` and config roots.

**Milkdown (2026):** Section / software-doc body editing uses `MilkdownEditor.tsx` + thin `SplitEditor.tsx`; `useYjsCollab` sends debounced `markdown_snapshot` JSON on the collab WebSocket. `@codemirror/merge` + `@codemirror/theme-one-dark` remain for `DiffTab.tsx`. Outline v2 keeps `Y.Text` via `YDOC_TEXT_FIELD` in `ws.ts`.

---

## A1. Dependency usage map

| Package | Status | Evidence |
|---------|--------|----------|
| **dependencies** | | |
| `@codemirror/commands` | transitive | `@milkdown/react` → `@milkdown/crepe` → `codemirror` (no direct `frontend/src` import) |
| `@codemirror/lang-markdown` | transitive + used-runtime | **`DiffTab.tsx`**; also under `@milkdown/crepe` language-data |
| `@codemirror/merge` | direct + used-runtime | **`DiffTab.tsx`** |
| `@codemirror/state` | transitive + used-runtime | **`DiffTab.tsx`** via merge / theme; `@milkdown/kit` components |
| `@codemirror/theme-one-dark` | direct + used-runtime | **`DiffTab.tsx`** |
| `@codemirror/view` | transitive + used-runtime | **`DiffTab.tsx`** via merge |
| `@dnd-kit/core` | used-runtime | `OutlineNav.tsx`, `WorkOrdersPage.tsx`, `ProjectOutlineCard.tsx` |
| `@dnd-kit/sortable` | used-runtime | `OutlineNav.tsx`, `ProjectOutlineCard.tsx` |
| `@dnd-kit/utilities` | transitive-peer / used-runtime | Imported from `OutlineNav.tsx`, `ProjectOutlineCard.tsx` (peer of sortable) |
| `@tanstack/react-query` | used-runtime | Widespread pages/components + `queryClient.ts`, `main.tsx` |
| `react` | used-runtime | All TSX |
| `react-dom` | used-runtime | Entry/tests |
| `react-force-graph-2d` | used-runtime | `KnowledgeGraph.tsx` |
| `react-markdown` | used-runtime | `SplitEditor.tsx`, `DocsUserGuidePage.tsx`, `ConversationView.tsx` |
| `recharts` | used-runtime | `TokenUsageReportPanel.tsx`, `LlmUsageReportPanel.tsx` (+ tests) |
| `remark-gfm` | used-runtime | Plugin string in `SplitEditor.tsx`, `DocsUserGuidePage.tsx`, `ConversationView.tsx` |
| `sonner` | used-runtime | `main.tsx`, `Toast.tsx`, `apiErrorToast.ts`, tests |
| `y-codemirror.next` | not installed | `npm ls` empty — not in `package.json`; v2 uses Milkdown/Yjs without this binding |
| `y-websocket` | used-runtime | `useYjsCollab.ts`, `ws.ts` |
| `yjs` | used-runtime | Editor, collab hook, tests, `sectionPatchApply` |
| **devDependencies** | | |
| `@eslint/js` | used-tooling | `eslint.config.js` |
| `@playwright/test` | used-tooling (E2E, out of scope) | `playwright.config.ts`, `e2e/**/*.ts` — do not modify E2E in this effort |
| `@tailwindcss/typography` | used-tooling | `src/index.css` (`@plugin "@tailwindcss/typography"`) |
| `@tailwindcss/vite` | used-tooling | `vite.config.ts` |
| `@testing-library/jest-dom` | used-tests-only | `src/test-setup.ts` |
| `@testing-library/react` | used-tests-only | `*.test.tsx` |
| `@testing-library/user-event` | used-tests-only | `*.test.tsx` |
| `@types/node` | used-tooling | TS / Vite |
| `@types/react` | used-tooling | TS |
| `@types/react-dom` | used-tooling | TS |
| `@vitejs/plugin-react` | used-tooling | `vite.config.ts`, `vitest.config.ts` |
| `@vitest/coverage-v8` | used-tooling | Vitest coverage provider |
| `eslint` | used-tooling | `npm run lint`, flat config |
| `eslint-plugin-react-hooks` | used-tooling | `eslint.config.js` |
| `eslint-plugin-react-refresh` | used-tooling | `eslint.config.js` |
| `globals` | used-tooling | `eslint.config.js` |
| `jsdom` | used-tooling | `vitest.config.ts` environment |
| `react-router-dom` | used-runtime | Listed under devDependencies but imported throughout `src/` (routing) — **keep**; consider moving to `dependencies` in a separate chore MR if desired |
| `tailwindcss` | used-tooling | `package.json` + `@import "tailwindcss"` in `index.css` |
| `typescript` | used-tooling | `npm run build` (`tsc -b`) |
| `typescript-eslint` | used-tooling | `eslint.config.js` |
| `vite` | used-tooling | `vite.config.ts`, scripts |
| `vitest` | used-tooling | `vitest.config.ts`, scripts |

**Unused (Phase A):** none identified — every declared package has a runtime, test-only, or tooling reference.

**Contradiction flag (prompt vs repo):** Project rules say “All REST calls via `api.ts`”; `tests.mdc` says “Use MSW — never mock `fetch`” while `atelier-cursor-rules.mdc` allows `vi.spyOn(api, ...)` for component tests. **Docs win:** established `api` spies for page tests remain; new `api.ts` / `ws.ts` tests prefer MSW per user prompt §7.

---

## A2. Component complexity & duplication (`pages/` + `components/` sources)

Columns: `path`, `lines (approx)`, `useState`, `useEffect`, `useQuery`, `useMutation`, `has *.test.tsx`, `refactor_candidate`.

| Path | LOC | useState | useEffect | useQuery | useMutation | test | candidate |
|------|-----|----------|-----------|----------|-------------|------|-----------|
| `WorkOrdersPage.tsx` | 1017 | 10 | 2 | 6 | 4 | no | **yes** — huge, low coverage |
| `CopilotPanel.tsx` | 885 | 10 | 4 | 5 | 3 | no | **yes** — size, Yjs/thread |
| `ProjectPage.tsx` | 843 | 3 | 3 | 14 | 4 | no | **yes** — size |
| `LlmUsageFilterBar.tsx` | 782 | 0 | 3 | 0 | 0 | no | **yes** — very low coverage |
| `SoftwarePage.tsx` | 658 | 3 | 1 | 10 | 1 | yes | **yes** — size, &lt;80% lines |
| `ArtifactLibraryPage.tsx` | 608 | 6 | 2 | 4 | 6 | yes | **yes** |
| `SectionPage.tsx` | 526 | 3 | 9 | 6 | 1 | yes | **yes** — localStorage (extract hook) |
| `SoftwareSettingsPage.tsx` | 402 | 7 | 1 | 4 | 4 | yes | medium |
| `BuilderHomeDashboard.tsx` | 456 | 0 | 5 | 6 | 0 | no | **yes** — effects + queries |
| `BuilderHomeHeader.tsx` | 387 | 3 | 0 | 0 | 0 | yes | no |
| `AdminSettingsPage.tsx` | 381 | 11 | 2 | 2 | 3 | no | **yes** — 11 useState, 0% cov |
| `StudioSettingsPage.tsx` | 421 | 5 | 2 | 3 | 7 | no | **yes** — 0% cov |
| `CopilotComposer.tsx` | 411 | 2 | 3 | 0 | 0 | yes | medium |
| `ArtifactDetailDrawer.tsx` | 444 | 2 | 1 | 4 | 4 | yes | medium |
| `ProjectOutlineCard.tsx` | 491 | 2 | 0 | 0 | 0 | yes | medium |
| `LlmUsageReportPanel.tsx` | 563 | 3 | 2 | 2 | 2 | no | **yes** — low cov |
| `TokenUsageReportPanel.tsx` | 396 | 9 | 1 | 0 | 2 | yes | medium (many useState) |
| `OutlineNav.tsx` | 267 | 0 | 0 | 0 | 0 | yes | **yes** — 48% line cov |
| `KnowledgeGraph.tsx` | 151 | 5 | 0 | 0 | 0 | no | **yes** — ~7% cov |
| `ChatRoom.tsx` | 180 | 2 | 2 | 1 | 0 | no | **yes** — ~3% cov |
| `SplitEditor.tsx` | 339 | 3 | 5 | 0 | 0 | yes | medium |
| Others | &lt;350 | varies | — | — | — | mixed | see coverage |

**Duplication (verified):** `SectionStatusPill` in `OutlineNav.tsx`, `LandingStatusPill` / `landingStatusPill` in `ProjectOutlineCard.tsx`, `ProjectWorkspaceStatusPill` in `ProjectPage.tsx` — candidates for `components/ui/StatusPill.tsx` in a later batch.

**Rule violations scanned:** No `useEffect`+`fetch` multiline pattern in `pages/` or `components/`. Raw `fetch` only under `services/` (components/pages clean). No `EventSource` in `src/`. `SectionPage.tsx` uses `localStorage` directly — **extract to hook** (Batch 1).

---

## A3. Baseline coverage

- **Command:** `npx vitest run --coverage --maxWorkers=1 --coverage.reporter=json-summary --coverage.reportsDirectory=c:/Repo/Atelier/.cursor/cache/frontend-coverage-baseline`
- **Reason:** Default `vitest.config.ts` only emits `text` + `html`; JSON written under `.cursor/cache/` to avoid tooling ignore on `frontend/coverage/`.
- **Overall `lines.pct`:** **62.8%** (target ≥80% — Phase E).

### Regression guard — `lines.pct` by file (baseline)

Snapshot source: `.cursor/cache/frontend-coverage-baseline/coverage-summary.json`. Do not regress these after refactors (excluding deleted files).

| File (relative to `frontend/`) | lines.pct |
|--------------------------------|-----------|
| `src/App.tsx` | 0 |
| `src/main.tsx` | 0 |
| `src/queryClient.ts` | 90.47 |
| `src/components/chat/ChatRoom.tsx` | 3.12 |
| `src/components/graph/KnowledgeGraph.tsx` | 7.43 |
| `src/components/outline/OutlineNav.tsx` | 48.09 |
| `src/components/thread/CopilotPanel.tsx` | 71.13 |
| `src/components/thread/CopilotComposer.tsx` | 70.86 |
| `src/components/thread/CopilotTabs.tsx` | 54.8 |
| `src/components/tokenUsage/LlmUsageFilterBar.tsx` | 33.96 |
| `src/components/tokenUsage/LlmUsageReportPanel.tsx` | 68.26 |
| `src/components/studio/StudioArtifactsSection.tsx` | 44.68 |
| `src/hooks/useYjsCollab.ts` | 0 |
| `src/hooks/useStream.ts` | 66.66 |
| `src/hooks/useStudioAccess.ts` | 90 |
| `src/pages/WorkOrdersPage.tsx` | 40.25 |
| `src/pages/SectionPage.tsx` | 76.88 |
| `src/services/api.ts` | 7.82 |
| `src/services/ws.ts` | 13.95 |
| `src/services/privateThreadSse.ts` | 0 |
| … | (full JSON in cache dir) |

**Baseline suite:** `npm run test:coverage` — **67 files, 246 tests passed** (no failures).

---

## Skipped — out of scope

- `frontend/e2e/**`, `*.spec.ts` (Playwright), `playwright.config.ts` behaviour — **do not modify** per scope.
- `backend/**`, Docker/CI/migrations — out of scope.
