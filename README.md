# Atelier (Slice 2 — Studios & Software)

Monorepo for **Atelier**: collaborative spec authoring, Work Orders, and GitLab publishing (see `docs/`).

This slice includes:

- **Backend:** FastAPI, JWT auth, tool-admin bootstrap, studios & software APIs with Studio Admin/Member RBAC, Fernet-encrypted Git tokens, GitLab connection test, `GET/PUT /admin/config`, full PostgreSQL + pgvector schema via Alembic, Docker Compose for Postgres + MinIO + optional frontend dev container.
- **Frontend:** React (Vite) + TypeScript + Tailwind v4, login/register, studio list/detail, software detail with definition + Git settings + test connection; API client + JWT in `localStorage`.
- **Tests:** Pytest integration test (requires Postgres; `docker compose up -d db`).

## Prerequisites

- Docker (for Postgres / optional full stack)
- Python 3.12+ (`backend/` uses SQLAlchemy 2 async)
- Node 20+ (for `frontend/`)

## Quick start (development)

### Database

```bash
docker compose up -d db
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt -r requirements-test.txt
set DATABASE_URL=postgresql+asyncpg://atelier:atelier@127.0.0.1:5432/atelier
set JWT_SECRET=your-long-random-secret-at-least-32-chars
python -m alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API: http://127.0.0.1:8000 — OpenAPI: http://127.0.0.1:8000/docs

### Frontend

**Option A — on your machine (default for day-to-day dev):**

```bash
cd frontend
npm install
npm run dev
```

**Option B — Vite in Docker** (hot reload via bind mount; use `docker compose up` in the repo root, or `docker compose up --build` the first time). See [Docker Compose (all services)](#docker-compose-all-services).

App: http://127.0.0.1:5173 — proxied to the API for `/auth`, `/admin`, `/health`. Server state for the home screen uses **TanStack React Query** (`@tanstack/react-query`); all REST calls stay in `src/services/api.ts` per project rules.

Optional: `frontend/.env` with `VITE_API_BASE_URL=https://your-api-host` for production builds.

## Emergency recovery

If every Tool Admin account is inaccessible, a sysadmin with shell access to the server can grant Tool Admin to an email (creates the user if needed) using the backend CLI:

```bash
cd backend
# Same DATABASE_URL as the app (postgresql+asyncpg://...); the script uses a sync driver internally.
set DATABASE_URL=postgresql+asyncpg://atelier:atelier@127.0.0.1:5432/atelier
python manage.py create-admin --email admin@example.com
python manage.py list-admins
```

Optional: `python manage.py create-admin --email admin@example.com --password <value>` sets the password explicitly; omitting `--password` generates a random 16-character password (printed once) for **new** users only.

## Tests

With Postgres running and `DATABASE_URL` set (see `tests/conftest.py` defaults):

```bash
cd backend
python -m pytest tests/integration -v
```

The integration test resets the schema via Alembic (`downgrade base` + `upgrade head`); **do not run against a production database**.

## Docker Compose (all services)

```bash
copy .env.example .env   # edit secrets
docker compose up --build
```

Set `ENCRYPTION_KEY` in `.env` to a Fernet key (see `.env.example`) if you will store GitLab tokens on software records.

Services: **Postgres**, **MinIO**, **backend** (migrations + Uvicorn on `:8000`), **frontend** (Vite dev server on `:5173` with HMR). The frontend container proxies `/auth`, `/admin`, `/health`, and `/studios` to the backend service via `ATELIER_API_PROXY`.

Open the app at http://127.0.0.1:5173.

Backend entrypoint runs `alembic upgrade head` then Uvicorn.

To run only infrastructure and use the API/UI on the host, see `docker-compose.dev.yml`.

## Project layout

See [Agent.md](Agent.md) for the full monorepo map. Migration scripts live in `backend/migrations/` (not `alembic/`, to avoid shadowing the Alembic Python package).

## Documentation

- [docs/atelier-functional-requirements.md](docs/atelier-functional-requirements.md)
- [docs/atelier-technical-architecture.md](docs/atelier-technical-architecture.md)
