# Playwright E2E (`frontend/e2e`)

## Preconditions

- **Backend** reachable from the machine running tests (default `http://127.0.0.1:8000`). With the Vite dev server, API calls are proxied from the frontend origin; see `frontend/vite.config.ts`.
- **Frontend** dev server at `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:5173`).
- **Database**: writable Postgres matching your compose stack. Admin console tests register users via HTTP (no direct DB access from tests).

There is **no** `webServer` block in `playwright.config.ts` — start Docker Compose (or your stack) first, per `docs/atelier-technical-architecture.md` §17.6.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PLAYWRIGHT_BASE_URL` | No (defaults to `http://127.0.0.1:5173`) | Origin for `page.goto` and the built-in API request fixture. |
| `PLAYWRIGHT_TOOL_ADMIN_EMAIL` | Recommended on shared DBs | Pre-seeded **platform admin** email for `toolAdminPage` fixture (env name is legacy). |
| `PLAYWRIGHT_TOOL_ADMIN_PASSWORD` | With email above | Password for that account. |
| `PLAYWRIGHT_NON_ADMIN_EMAIL` | Optional | Pre-seeded non–platform-admin for `nonAdminPage` (see fixture). |
| `PLAYWRIGHT_NON_ADMIN_PASSWORD` | With email above | Password for that account. |
| `PLAYWRIGHT_STUDIO_URL` | For legacy studio specs only | See `studio-landing.spec.ts`. |
| `PLAYWRIGHT_ARTIFACTS_URL` | For artifact RAG spec | See `artifact-rag-indexing.spec.ts`. |

If `PLAYWRIGHT_TOOL_ADMIN_*` are **not** set, the fixture registers a new user **once per worker** and requires that user to become platform admin (`is_platform_admin`, true only when that registration is the **first** user in an empty database). Otherwise set the env vars to a seeded platform-admin account.

`PLAYWRIGHT_TOOL_ADMIN_*` and `PLAYWRIGHT_NON_ADMIN_*` are resolved in **worker-scoped** fixtures: each worker performs **one** `/auth/login` (or register) for platform admin and **one** for non-admin, then all tests reuse `storageState` in fresh browser contexts. That avoids `/auth/login` **429**s when many admin tests run in sequence.

## Commands

From `frontend/`:

```bash
npm run test:e2e
```

Admin console suite only:

```bash
npx playwright test e2e/specs/admin --workers=1
```

Use `--workers=1` to reduce parallel `/auth/register` traffic against backends that rate-limit registration or login. When you see `429` on **login** or register in CI or shared dev stacks, set `PLAYWRIGHT_TOOL_ADMIN_EMAIL` / `PLAYWRIGHT_TOOL_ADMIN_PASSWORD` (and optionally `PLAYWRIGHT_NON_ADMIN_*`) to seeded accounts instead of bootstrapping via register.

List tests without executing:

```bash
npx playwright test --list
```

Typecheck E2E + Node config (includes `e2e/**/*.ts` via `tsconfig.node.json`):

```bash
npx tsc --noEmit -p tsconfig.node.json
```

## LLM / connectivity

Admin console E2E does **not** call real LLM providers. The LLM spec stubs `POST /admin/test/llm` at the browser level (`page.route` via POM). The embeddings specs stub `POST /admin/test/embedding` (and optionally `PATCH /admin/embeddings/reindex-policy` for policy save) the same way.

## Conventions

- **Page Object Model**: specs use classes under `e2e/pages/`; no raw `page.click()` / `page.fill()` in spec files.
- **Auth**: `e2e/fixtures/auth.fixture.ts` extends `test` with `toolAdminPage` and `nonAdminPage` (worker-scoped login/register once → cookie `storageState`; each test opens a new browser context from that state).
