# Configuration and deployment

This document summarizes important environment variables and Compose profiles. Canonical behaviour is described in [atelier-technical-architecture.md](atelier-technical-architecture.md).

## Environment variables (backend)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Async SQLAlchemy URL (`postgresql+asyncpg://…`). |
| `JWT_SECRET` | HS256 signing secret; use a long random value (32+ characters). |
| `JWT_EXPIRE_MINUTES` | Access token lifetime (cookie `max_age` derives from this). |
| `ENCRYPTION_KEY` | Fernet key for **GitLab tokens at rest** on software records. Required before saving tokens in production. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed for credentialed requests. |
| `ENV` | `dev` (default) or `production` — affects logging format. |
| `SECURE_COOKIES` | `true` in production when the app is served only over HTTPS. |
| `expose_internal_error_detail` | Set via `ATELIER_EXPOSE_INTERNAL_ERRORS=true` only on **non-production** debug hosts — never enable in production. |
| `MINIO_*` | Object storage endpoint and credentials (see `.env.example` / Docker Compose). |

Tool Admin LLM provider keys and embedding routing are stored in the database (`llm_provider_registry`, `llm_routing_rules`), not in `.env`.

## Frontend build-time

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Absolute API origin for production builds (e.g. `https://api.example.com`). Leave unset for same-origin dev. |

## Docker Compose profiles

| File | Use |
|------|-----|
| `docker-compose.yml` | Local full stack: Postgres, MinIO, backend (migrate + Uvicorn), Vite frontend with HMR. |
| `docker-compose.dev.yml` | Infrastructure only; run API and UI on the host with hot reload. |
| `docker-compose.prod.yml` | Overrides: restart policies, backend health check, production frontend image (`Dockerfile.prod`), no bind mounts on `frontend`. |

Production-style stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Run migrations **once** before or after upgrading images (example):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend \
  sh -c "alembic upgrade head"
```

Example variable set for production builds: [env-production.example](env-production.example).

## Health checks

- HTTP: `GET /health` on the backend returns `{"status":"ok"}`.

## Related

- [admin-setup.md](admin-setup.md) — first-time Tool Admin and integrations.
- [README.md](../README.md) — quick start and tests.
