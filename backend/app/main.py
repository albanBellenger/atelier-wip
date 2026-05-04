"""FastAPI application entry point."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIASGIMiddleware  # pure ASGI; BaseHTTP SlowAPIMiddleware breaks async DB in same loop
from slowapi.util import get_remote_address

from app.collab.server import init_collab_server
from app.config import get_settings
from app.storage.minio_storage import get_storage_client
from app.database import async_session_factory, engine
from app.exceptions import ApiError

limiter = Limiter(key_func=get_remote_address)

from app.routers import (
    admin,
    artifacts,
    artifacts_by_id,
    auth,
    collab,
    me_builder_composer,
    me_notifications,
    me_token_usage,
    mcp_api,
    private_threads,
    project_attention,
    project_chat,
    project_graph,
    project_issues,
    project_publish,
    projects,
    sections,
    software,
    software_chat,
    software_workspace,
    studios,
    work_orders,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await get_storage_client().ensure_bucket()
    srv = init_collab_server(async_session_factory)
    stale_task: asyncio.Task[None] | None = None
    if os.environ.get("ATELIER_STALE_DRAFT_NOTIFIER") == "1":

        async def _stale_loop() -> None:
            from app.services.draft_unpublished_notification_job import (
                run_draft_unpublished_notifications,
            )

            while True:
                await asyncio.sleep(86_400)
                try:
                    async with async_session_factory() as s:
                        n = await run_draft_unpublished_notifications(s)
                        await s.commit()
                        log.info("stale_draft_notifier", created=n)
                except Exception:
                    log.exception("stale_draft_notifier_failed")

        stale_task = asyncio.create_task(_stale_loop())
    async with srv:
        yield
    if stale_task is not None:
        stale_task.cancel()
        try:
            await stale_task
        except asyncio.CancelledError:
            pass
    if not os.environ.get("PYTEST_VERSION"):
        await engine.dispose()


def _add_logger_name_if_present(logger: object, _method_name: str, event_dict: dict) -> dict:
    """stdlib's add_logger_name crashes with PrintLoggerFactory (no .name)."""
    name = getattr(logger, "name", None)
    if name is not None:
        event_dict["logger"] = name
    return event_dict


def configure_logging() -> None:
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        _add_logger_name_if_present,
        structlog.processors.TimeStamper(fmt="iso"),
    ]
    if os.getenv("ENV", "dev") == "production":
        processors = shared_processors + [structlog.processors.JSONRenderer()]
    else:
        processors = shared_processors + [structlog.dev.ConsoleRenderer()]
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


configure_logging()
log = structlog.get_logger("atelier")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Atelier API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(SlowAPIASGIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
        detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": detail_msg, "code": exc.error_code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        errs = exc.errors()
        code = "VALIDATION_ERROR"
        if len(errs) == 1 and errs[0].get("type") == "SECTION_REQUIRED":
            code = "SECTION_REQUIRED"
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": jsonable_encoder(errs),
                "code": code,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Return structured JSON for unexpected errors (never leak raw trace in production)."""
        if isinstance(exc, (HTTPException, RequestValidationError, RateLimitExceeded)):
            raise exc
        log.exception(
            "unhandled_exception",
            path=str(request.url.path),
            exc_type=type(exc).__name__,
        )
        settings = get_settings()
        detail = "An unexpected error occurred."
        if settings.env == "dev" and settings.expose_internal_error_detail:
            detail = f"{type(exc).__name__}: {exc}"
        return JSONResponse(
            status_code=500,
            content={"detail": detail, "code": "INTERNAL_ERROR"},
        )

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(me_notifications.router)
    app.include_router(me_token_usage.router)
    app.include_router(me_builder_composer.router)
    app.include_router(admin.router)
    app.include_router(studios.router)
    app.include_router(mcp_api.router)
    app.include_router(software.router)
    app.include_router(software_workspace.router)
    app.include_router(projects.router)
    app.include_router(project_graph.router)
    app.include_router(project_publish.router)
    app.include_router(project_issues.router)
    app.include_router(project_attention.router)
    app.include_router(sections.router)
    app.include_router(artifacts.router)
    app.include_router(artifacts_by_id.router)
    app.include_router(work_orders.router)
    app.include_router(private_threads.router)
    app.include_router(project_chat.router)
    app.include_router(software_chat.router)
    app.include_router(collab.router)

    if os.environ.get("PYTEST_VERSION"):
        @app.get(
            "/__pytest_probe_internal_error",
            tags=["health"],
            include_in_schema=False,
            response_model=None,
        )
        async def _pytest_probe_internal_error() -> None:
            raise RuntimeError("deliberate unhandled error for integration tests")

    return app


app = create_app()
