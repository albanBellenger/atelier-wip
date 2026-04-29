"""FastAPI application entry point."""

import logging
import os

import structlog
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIASGIMiddleware  # pure ASGI; BaseHTTP SlowAPIMiddleware breaks async DB in same loop
from slowapi.util import get_remote_address

from app.config import get_settings
from app.database import engine
from app.exceptions import ApiError

limiter = Limiter(key_func=get_remote_address)

from app.routers import admin, auth, projects, sections, software, studios


def configure_logging() -> None:
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
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
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.on_event("shutdown")
    async def _dispose_engine() -> None:
        # Under pytest, ASGI shutdown can interleave with the test DB connection
        # teardown; skip disposing the process-global engine (pool is not used for
        # requests when get_db is overridden).
        if os.environ.get("PYTEST_VERSION"):
            return
        await engine.dispose()

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
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": jsonable_encoder(exc.errors()),
                "code": "VALIDATION_ERROR",
            },
        )

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(studios.router)
    app.include_router(software.router)
    app.include_router(projects.router)
    app.include_router(sections.router)
    return app


app = create_app()
