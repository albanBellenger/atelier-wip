# Atelier (Slice 1 — Foundation)

Monorepo for **Atelier**: collaborative spec authoring, Work Orders, and GitLab publishing (see `docs/`).

This slice includes:

- **Backend:** FastAPI, JWT auth, tool-admin bootstrap (first registered user), `GET/PUT /admin/config`, full PostgreSQL + pgvector schema via Alembic, Docker Compose for Postgres + MinIO.
- **Frontend:** React (Vite) + TypeScript + Tailwind v4, login/register, API client with JWT in `localStorage`.
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

```bash
cd frontend
npm install
npm run dev
```

App: http://127.0.0.1:5173 — proxied to the API for `/auth`, `/admin`, `/health`.

Optional: `frontend/.env` with `VITE_API_BASE_URL=https://your-api-host` for production builds.

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

Backend entrypoint runs `alembic upgrade head` then Uvicorn.

## Project layout

See [Agent.md](Agent.md) for the full monorepo map. Migration scripts live in `backend/migrations/` (not `alembic/`, to avoid shadowing the Alembic Python package).

## Documentation

- [docs/atelier-functional-requirements.md](docs/atelier-functional-requirements.md)
- [docs/atelier-technical-architecture.md](docs/atelier-technical-architecture.md)
