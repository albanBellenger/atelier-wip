"""Unit tests for LiteLLM → ApiError mapping."""

from __future__ import annotations

import httpx
import pytest
from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    UnprocessableEntityError,
)

from app.exceptions import ApiError
from app.services.litellm_exception_mapping import map_litellm_exception
from litellm.exceptions import (
    ContentPolicyViolationError,
    ContextWindowExceededError,
    ServiceUnavailableError,
    UnsupportedParamsError,
)

_REQ = httpx.Request("POST", "https://example.test/v1/chat/completions")


def _resp(status: int) -> httpx.Response:
    return httpx.Response(status, request=_REQ)


@pytest.mark.parametrize(
    ("exc", "family", "expected_status", "expected_subcode"),
    [
        (APITimeoutError(request=_REQ), "chat", 504, "LLM_TIMEOUT"),
        (APITimeoutError(request=_REQ), "embedding", 504, "EMBEDDING_TIMEOUT"),
        (APIConnectionError(message="c", request=_REQ), "chat", 502, "LLM_TRANSPORT_ERROR"),
        (APIConnectionError(message="c", request=_REQ), "embedding", 502, "EMBEDDING_TRANSPORT_ERROR"),
        (RateLimitError("r", response=_resp(429), body=None), "chat", 429, "LLM_RATE_LIMITED"),
        (RateLimitError("r", response=_resp(429), body=None), "embedding", 429, "EMBEDDING_RATE_LIMITED"),
        (AuthenticationError("a", response=_resp(401), body=None), "chat", 502, "LLM_UPSTREAM_UNAUTHORIZED"),
        (PermissionDeniedError("p", response=_resp(403), body=None), "chat", 502, "LLM_UPSTREAM_FORBIDDEN"),
        (NotFoundError("n", response=_resp(404), body=None), "chat", 502, "LLM_UPSTREAM_NOT_FOUND"),
        (
            ContextWindowExceededError("ctx", "gpt-4", "openai"),
            "chat",
            400,
            "LLM_CONTEXT_WINDOW_EXCEEDED",
        ),
        (
            ContentPolicyViolationError("cp", "gpt-4", "openai"),
            "chat",
            400,
            "LLM_CONTENT_POLICY",
        ),
        (UnsupportedParamsError("u", llm_provider="openai", model="gpt-4"), "chat", 502, "LLM_UPSTREAM_BAD_REQUEST"),
        (BadRequestError("b", response=_resp(400), body=None), "chat", 502, "LLM_UPSTREAM_BAD_REQUEST"),
        (
            UnprocessableEntityError("u", response=_resp(422), body=None),
            "chat",
            422,
            "LLM_UPSTREAM_UNPROCESSABLE",
        ),
        (ServiceUnavailableError("s", "openai", "gpt-4"), "chat", 502, "LLM_UPSTREAM_ERROR"),
        (InternalServerError("i", response=_resp(500), body=None), "chat", 502, "LLM_UPSTREAM_ERROR"),
        (APIError("a", _REQ, body=None), "chat", 502, "LLM_UPSTREAM_ERROR"),
    ],
)
def test_map_litellm_exception_matrix(
    exc: Exception,
    family: str,
    expected_status: int,
    expected_subcode: str,
) -> None:
    out = map_litellm_exception(exc, family=family)  # type: ignore[arg-type]
    assert isinstance(out, ApiError)
    assert out.status_code == expected_status
    assert out.error_code == expected_subcode


def test_map_unknown_exception_fallback_chat() -> None:
    out = map_litellm_exception(RuntimeError("boom"), family="chat")
    assert out.status_code == 502
    assert out.error_code == "LLM_UPSTREAM_ERROR"


def test_bad_request_ambiguous_model_maps_to_llm_model_ambiguous() -> None:
    exc = BadRequestError(
        "LLM Provider NOT provided. Pass model as provider/model",
        response=_resp(400),
        body=None,
    )
    out = map_litellm_exception(exc, family="chat")
    assert out.status_code == 400
    assert out.error_code == "LLM_MODEL_AMBIGUOUS"


def test_bad_request_ambiguous_model_embedding_family() -> None:
    exc = BadRequestError(
        "Pass model as provider/model",
        response=_resp(400),
        body=None,
    )
    out = map_litellm_exception(exc, family="embedding")
    assert out.status_code == 400
    assert out.error_code == "EMBEDDING_MODEL_AMBIGUOUS"
