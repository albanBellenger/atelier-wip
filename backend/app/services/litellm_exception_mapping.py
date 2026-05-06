"""Map LiteLLM / OpenAI-shaped provider errors to Atelier :class:`ApiError`.

See https://docs.litellm.ai/docs/exception_mapping
"""

from __future__ import annotations

from typing import Literal

import structlog
from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    NotFoundError,
    OpenAIError,
    PermissionDeniedError,
    RateLimitError,
    UnprocessableEntityError,
)

from app.exceptions import ApiError
from litellm.exceptions import (
    ContentPolicyViolationError,
    ContextWindowExceededError,
    JSONSchemaValidationError,
    ServiceUnavailableError,
    UnsupportedParamsError,
)

log = structlog.get_logger("atelier.litellm_exception_mapping")

Family = Literal["chat", "embedding"]


def _pfx(family: Family) -> str:
    return "LLM_" if family == "chat" else "EMBEDDING_"


def _log_upstream(exc: BaseException, *, family: Family) -> None:
    status = getattr(exc, "status_code", None)
    prov = getattr(exc, "llm_provider", None)
    msg = str(getattr(exc, "message", exc))[:500]
    psf = getattr(exc, "provider_specific_fields", None)
    keys: list[str] = []
    if isinstance(psf, dict):
        keys = [str(k) for k in list(psf.keys())[:12]]
    log.warning(
        "litellm_upstream_error",
        family=family,
        exc_type=type(exc).__name__,
        status_code=status,
        llm_provider=prov,
        message=msg,
        provider_specific_field_keys=keys,
    )


def map_litellm_exception(exc: BaseException, *, family: Family) -> ApiError:
    """Convert a LiteLLM-raised exception into :class:`ApiError`."""
    p = _pfx(family)
    _log_upstream(exc, family=family)

    if isinstance(exc, ContextWindowExceededError):
        return ApiError(
            status_code=400,
            code=f"{p}CONTEXT_WINDOW_EXCEEDED",
            message="The request exceeded the model context window. Shorten history or content.",
        )
    if isinstance(exc, ContentPolicyViolationError):
        return ApiError(
            status_code=400,
            code=f"{p}CONTENT_POLICY",
            message="The provider rejected the request due to content policy.",
        )
    if isinstance(exc, UnsupportedParamsError):
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_BAD_REQUEST",
            message="The language model provider rejected the request parameters.",
        )
    if isinstance(exc, BadRequestError):
        raw_msg = str(getattr(exc, "message", exc) or "")
        if "LLM Provider NOT provided" in raw_msg or "Pass model as" in raw_msg:
            return ApiError(
                status_code=400,
                code="LLM_MODEL_AMBIGUOUS"
                if family == "chat"
                else "EMBEDDING_MODEL_AMBIGUOUS",
                message=(
                    "LiteLLM needs a provider-qualified model id (for example moonshot/model-id). "
                    "Set a LiteLLM provider slug on the registry row, or use provider/model in routing."
                    if family == "chat"
                    else "LiteLLM needs a provider-qualified embedding model id. "
                    "Set a LiteLLM provider slug on the embedding catalog row, or use provider/model."
                ),
            )
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_BAD_REQUEST",
            message="The language model provider rejected the request.",
        )
    if isinstance(exc, AuthenticationError):
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_UNAUTHORIZED",
            message="Upstream LLM authentication failed (check API key).",
        )
    if isinstance(exc, PermissionDeniedError):
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_FORBIDDEN",
            message="Upstream LLM access was forbidden.",
        )
    if isinstance(exc, NotFoundError):
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_NOT_FOUND",
            message="Upstream LLM returned not found (e.g. unknown model or deployment).",
        )
    if isinstance(exc, RateLimitError):
        return ApiError(
            status_code=429,
            code=f"{p}RATE_LIMITED",
            message="The language model provider rate limit was hit. Try again later.",
        )
    if isinstance(exc, APITimeoutError):
        return ApiError(
            status_code=504,
            code=f"{p}TIMEOUT" if family == "embedding" else "LLM_TIMEOUT",
            message=(
                "The language model did not respond in time. Try again with fewer "
                "sections or when the provider is less busy."
                if family == "chat"
                else "Embedding provider did not respond in time."
            ),
        )
    if isinstance(exc, APIConnectionError):
        return ApiError(
            status_code=502,
            code=f"{p}TRANSPORT_ERROR" if family == "embedding" else "LLM_TRANSPORT_ERROR",
            message=(
                "Could not reach the language model service."
                if family == "chat"
                else "Could not reach the embedding service."
            ),
        )
    if isinstance(exc, UnprocessableEntityError):
        return ApiError(
            status_code=422,
            code=f"{p}UPSTREAM_UNPROCESSABLE",
            message="The language model provider could not process the request.",
        )
    if isinstance(exc, ServiceUnavailableError):
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_ERROR" if family == "chat" else "EMBEDDING_UPSTREAM_ERROR",
            message="LLM provider is temporarily unavailable."
            if family == "chat"
            else "Embedding provider is temporarily unavailable.",
        )
    if isinstance(exc, JSONSchemaValidationError):
        return ApiError(
            status_code=502,
            code="LLM_RESPONSE_SCHEMA_MISMATCH" if family == "chat" else f"{p}UPSTREAM_ERROR",
            message="LLM response failed schema validation.",
        )
    if isinstance(exc, InternalServerError):
        return ApiError(
            status_code=502,
            code=f"{p}UPSTREAM_ERROR" if family == "chat" else "EMBEDDING_UPSTREAM_ERROR",
            message="LLM provider returned an error." if family == "chat" else "Embedding provider returned an error.",
        )
    if isinstance(exc, APIError):
        return ApiError(
            status_code=502,
            code="LLM_UPSTREAM_ERROR" if family == "chat" else "EMBEDDING_UPSTREAM_ERROR",
            message="LLM provider returned an error." if family == "chat" else "Embedding provider returned an error.",
        )
    if isinstance(exc, OpenAIError):
        return ApiError(
            status_code=502,
            code="LLM_UPSTREAM_ERROR" if family == "chat" else "EMBEDDING_UPSTREAM_ERROR",
            message="LLM provider returned an error." if family == "chat" else "Embedding provider returned an error.",
        )
    return ApiError(
        status_code=502,
        code="LLM_UPSTREAM_ERROR" if family == "chat" else "EMBEDDING_UPSTREAM_ERROR",
        message="LLM provider returned an error." if family == "chat" else "Embedding provider returned an error.",
    )


def map_litellm_exception_to_probe_detail(exc: BaseException) -> tuple[str, str]:
    """Return ``(message, detail)`` for :class:`AdminConnectivityResult` (no ApiError)."""
    if isinstance(exc, APITimeoutError):
        return "LLM request failed (network or timeout).", str(exc)[:800]
    if isinstance(exc, APIConnectionError):
        return "LLM request failed (network or timeout).", str(exc)[:800]
    if isinstance(exc, RateLimitError):
        return "LLM provider returned rate limit.", str(exc)[:800]
    if isinstance(exc, OpenAIError):
        return "LLM provider returned an error.", str(exc)[:800]
    return "LLM request failed.", str(exc)[:800]
