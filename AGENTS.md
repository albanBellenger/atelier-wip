# Atelier — agent notes

Human-oriented guidance lives in [Agent.md](Agent.md) and [README.md](README.md).

## Cursor Cloud specific instructions

- **Docker:** Some VMs ship without Docker. After installing Docker Engine, `systemd` may still refuse to start it (`policy-rc.d`). If `docker info` fails with permission errors while `dockerd` is running, use `sudo docker …` or add your user to the `docker` group. On nested kernels, `fuse-overlayfs` as the graph driver (see `/etc/docker/daemon.json`) avoids overlay2 feature gaps.
- **Local infrastructure:** For host-based API/UI, start Postgres + MinIO with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db storage` (see [README.md](README.md) “Quick start”). Pytest integration tests expect **PostgreSQL on `127.0.0.1:5433`** from [docker-compose.test.yml](docker-compose.test.yml); see `backend/tests/conftest.py`. Default MinIO credentials in [docker-compose.yml](docker-compose.yml) match `Settings` in `backend/app/config.py` (`MINIO_ROOT_PASSWORD` is `atelierdev`, not `atelier`).
- **Backend dev server:** Export `DATABASE_URL` and a 32+ character `JWT_SECRET`, run `python -m alembic upgrade head`, then `uvicorn app.main:app --reload` ([README.md](README.md)). First-time Python env: `cd backend && python3 -m venv .venv` — on Debian/Ubuntu you need the `python3.12-venv` package if `ensurepip` is missing.
- **Frontend dev server:** `cd frontend && npm run dev`. Vite proxies `/auth`, `/studios`, `/admin`, etc. to `ATELIER_API_PROXY` (defaults to `http://127.0.0.1:8000`); see [frontend/vite.config.ts](frontend/vite.config.ts).
- **Checks that should be green in a healthy tree:** `cd frontend && npm test` (Vitest). Backend: `cd backend && python -m pytest tests/unit tests/integration` with the test DB up.
- **Known rough edges (verify before blaming the VM):** `npm run lint` and `npm run build` may report many ESLint / `tsc` issues on `main`; the Vitest suite is the reliable SPA signal. If a large number of backend integration tests fail with logic/assert errors (not connection refused), suspect test/product drift rather than missing services.
