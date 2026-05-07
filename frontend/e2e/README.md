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
| `PLAYWRIGHT_STUDIO_URL` | For legacy studio specs only | See `studio-landing.spec.ts`. |
| `PLAYWRIGHT_ARTIFACTS_URL` | For artifact RAG spec | See `artifact-rag-indexing.spec.ts`. |

If `PLAYWRIGHT_TOOL_ADMIN_*` are **not** set, the `toolAdminPage` fixture registers a new user and requires that user to become platform admin (`is_platform_admin`, true only when that registration is the **first** user in an empty database). Otherwise set the env vars to a seeded platform-admin account.

## Commands

From `frontend/`:

```bash
npm run test:e2e
```

Admin console suite only:

```bash
npx playwright test e2e/specs/admin
```

List tests without executing:

```bash
npx playwright test --list
```

Typecheck E2E + Node config (includes `e2e/**/*.ts` via `tsconfig.node.json`):

```bash
npx tsc --noEmit -p tsconfig.node.json
```

## LLM / connectivity

Admin console E2E does **not** call real LLM providers. The LLM spec stubs `POST /admin/test/llm` at the browser level (`page.route` via POM).

## Conventions

- **Page Object Model**: specs use classes under `e2e/pages/`; no raw `page.click()` / `page.fill()` in spec files.
- **Auth**: `e2e/fixtures/auth.fixture.ts` extends `test` with `toolAdminPage` and `nonAdminPage` (HTTP register/login, cookie `storageState`).
