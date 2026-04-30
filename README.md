# Atelier

Monorepo for **Atelier**: collaborative software specifications, real-time section editing (Yjs), artifacts and RAG, work orders, GitLab publish, knowledge graph, project chat, MCP integration, cross-studio access, and token usage reporting.

See [docs/atelier-functional-requirements.md](docs/atelier-functional-requirements.md) and [docs/atelier-technical-architecture.md](docs/atelier-technical-architecture.md) for the canonical product and system design.

## Stack

- **Backend:** FastAPI, async SQLAlchemy, PostgreSQL + pgvector, MinIO, JWT (HttpOnly cookie), RBAC, Alembic migrations.
- **Frontend:** React 19, Vite, TypeScript (strict), Tailwind v4, TanStack Query; API client in `frontend/src/services/api.ts`.
- **Tests:** Backend pytest (`tests/unit`, `tests/integration`); LLM regression in `backend/tests/llm` (`@pytest.mark.llm`, nightly / manual); frontend Vitest.

## Prerequisites

- Docker (for Postgres / MinIO / optional full stack)
- Python 3.12+ for `backend/`
- Node 20+ for `frontend/`

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

**Option B — Vite in Docker** (hot reload via bind mount; `docker compose up` from the repo root). See [Docker Compose](#docker-compose-all-services).

App: http://127.0.0.1:5173 — the dev container proxies API routes to the backend via `ATELIER_API_PROXY`.

For production builds, set `VITE_API_BASE_URL` to the public API origin (see [docs/configuration.md](docs/configuration.md)).

## Emergency recovery

If every Tool Admin account is inaccessible, a sysadmin with shell access to the server can grant Tool Admin to an email (creates the user if needed) using the backend CLI:

```bash
cd backend
set DATABASE_URL=postgresql+asyncpg://atelier:atelier@127.0.0.1:5432/atelier
python manage.py create-admin --email admin@example.com
python manage.py list-admins
```

Optional: `python manage.py create-admin --email admin@example.com --password <value>` sets the password explicitly; omitting `--password` generates a random 16-character password (printed once) for **new** users only.

## Tests

**Backend** (Postgres required; see `backend/tests/conftest.py`):

```bash
cd backend
python -m pytest tests/unit tests/integration -v
```

LLM regression (real provider; set `LLM_API_KEY` or `OPENAI_API_KEY`, optional `LLM_MODEL`; use `SKIP_LLM=true` to skip when collecting `tests/llm`):

```bash
cd backend
python -m pytest tests/llm -v -m llm
```

The integration suite resets the schema via Alembic; **do not run against a production database**.

**Frontend:**

```bash
cd frontend
npm test
```

## Docker Compose (all services)

```bash
copy .env.example .env   # edit secrets
docker compose up --build
```

Set `ENCRYPTION_KEY` in `.env` to a Fernet key (see `.env.example`) if you will store GitLab tokens on software records.

Services: **Postgres**, **MinIO**, **backend** (migrations + Uvicorn on `:8000`), **frontend** (Vite on `:5173` with HMR).

**Production-style overrides** (static frontend, restart policies, backend health check, no frontend bind mount):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

See [docs/configuration.md](docs/configuration.md) and [docs/env-production.example](docs/env-production.example).

To run only infrastructure and use the API/UI on the host, see `docker-compose.dev.yml`.

## Project layout

See [Agent.md](Agent.md) for the full monorepo map. Migration scripts live in `backend/migrations/`.

## Documentation

- [docs/atelier-functional-requirements.md](docs/atelier-functional-requirements.md)
- [docs/atelier-technical-architecture.md](docs/atelier-technical-architecture.md)
- [docs/configuration.md](docs/configuration.md)
- [docs/admin-setup.md](docs/admin-setup.md)
