"""Central LLM calls (OpenAI-compatible); integrates TokenTracker."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig
from app.openai_compat_urls import chat_completions_url
from app.schemas.auth import AdminConnectivityResult
from app.schemas.token_context import TokenContext
from app.services.embedding_service import EmbeddingService
from app.services.llm_policy_service import LlmPolicyService
from app.services.token_tracker import record_usage

log = structlog.get_logger("atelier.llm_service")


def _validate_json_schema(json_schema: dict[str, Any]) -> None:
    """Enforce OpenAI ``response_format.json_schema`` envelope shape."""
    if not isinstance(json_schema, dict):
        raise ApiError(
            status_code=500,
            code="LLM_SCHEMA_INVALID",
            message="json_schema must be a dict with name, strict, and schema keys.",
        )
    name = json_schema.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ApiError(
            status_code=500,
            code="LLM_SCHEMA_INVALID",
            message="json_schema.name must be a non-empty string.",
        )
    if json_schema.get("strict") is not True:
        raise ApiError(
            status_code=500,
            code="LLM_SCHEMA_INVALID",
            message="json_schema.strict must be True.",
        )
    inner = json_schema.get("schema")
    if not isinstance(inner, dict) or inner.get("type") != "object":
        raise ApiError(
            status_code=500,
            code="LLM_SCHEMA_INVALID",
            message='json_schema.schema must be an object with type "object".',
        )


def _upstream_error_log_fields(
    *, status_code: int, headers: httpx.Headers, body_text: str
) -> dict[str, Any]:
    """Log-safe subset of an upstream LLM error (never raw body text)."""
    out: dict[str, Any] = {
        "status": status_code,
        "request_id": headers.get("x-request-id"),
    }
    try:
        data = json.loads(body_text)
    except json.JSONDecodeError:
        return out
    if not isinstance(data, dict):
        return out
    err = data.get("error")
    if isinstance(err, dict):
        if "code" in err:
            out["upstream_error_code"] = err.get("code")
        if "type" in err:
            out["upstream_error_type"] = err.get("type")
    return out


# Default OpenAI chat/completions URL (no custom Tool Admin base).
OPENAI_CHAT_COMPLETIONS_URL = chat_completions_url(None)

# Shared JSON-schema envelope for work-order batch generation (Slice 7).
WORK_ORDER_BATCH_JSON_SCHEMA: dict[str, Any] = {
    "name": "work_order_batch",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "implementation_guide": {"type": "string"},
                        "acceptance_criteria": {"type": "string"},
                        "linked_section_slugs": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": [
                        "title",
                        "description",
                        "implementation_guide",
                        "acceptance_criteria",
                        "linked_section_slugs",
                    ],
                },
            },
        },
        "required": ["items"],
    },
}


class LLMService:
    """OpenAI chat completions + structured JSON; records token_usage."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _require_openai_config_for_context(
        self,
        *,
        context: TokenContext,
        call_type: str,
    ) -> tuple[str, str, str]:
        policy = LlmPolicyService(self.db)
        await policy.assert_studio_budget(context.studio_id)
        await policy.assert_builder_budget(context.studio_id, context.user_id)
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            log.warning(
                "llm_config_rejected",
                reason="no_admin_config_row",
            )
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM provider, model, and API key.",
            )
        override = await policy.resolve_effective_model(
            studio_id=context.studio_id,
            call_type=call_type,
        )
        model_raw = override if override else (row.llm_model or "")
        model = model_raw.strip()
        key = (row.llm_api_key or "").strip()
        prov = (row.llm_provider or "").strip().lower()
        if not model or not key:
            log.warning(
                "llm_config_rejected",
                reason="missing_model_or_api_key",
                llm_model_set=bool(model),
                llm_api_key_set=bool(key),
            )
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM model and API key.",
            )
        if prov and prov != "openai":
            log.warning(
                "llm_config_rejected",
                reason="unsupported_provider",
                llm_provider=prov,
            )
            raise ApiError(
                status_code=503,
                code="LLM_PROVIDER_UNSUPPORTED",
                message=(
                    "Set llm_provider to 'openai' (or leave empty) for OpenAI-compatible APIs; "
                    "use LLM API base URL for a custom endpoint."
                ),
            )
        chat_url = chat_completions_url(row.llm_api_base_url)
        return model, key, chat_url

    async def _require_openai_config(self) -> tuple[str, str, str]:
        """Legacy path without studio routing (admin probes only)."""
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            log.warning(
                "llm_config_rejected",
                reason="no_admin_config_row",
            )
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM provider, model, and API key.",
            )
        model = (row.llm_model or "").strip()
        key = (row.llm_api_key or "").strip()
        prov = (row.llm_provider or "").strip().lower()
        if not model or not key:
            log.warning(
                "llm_config_rejected",
                reason="missing_model_or_api_key",
                llm_model_set=bool(model),
                llm_api_key_set=bool(key),
            )
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM model and API key.",
            )
        if prov and prov != "openai":
            log.warning(
                "llm_config_rejected",
                reason="unsupported_provider",
                llm_provider=prov,
            )
            raise ApiError(
                status_code=503,
                code="LLM_PROVIDER_UNSUPPORTED",
                message=(
                    "Set llm_provider to 'openai' (or leave empty) for OpenAI-compatible APIs; "
                    "use LLM API base URL for a custom endpoint."
                ),
            )
        chat_url = chat_completions_url(row.llm_api_base_url)
        return model, key, chat_url

    async def ensure_openai_llm_ready(self) -> None:
        """Validate Tool Admin LLM config before returning a StreamingResponse.

        Streaming endpoints must call this in the route handler *before* constructing
        ``StreamingResponse``: Starlette sends response headers before the stream body
        runs, so :class:`ApiError` raised inside the stream iterator cannot be turned
        into JSON and causes ``RuntimeError: response already started``.
        """
        await self._require_openai_config()

    async def chat_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        context: TokenContext,
        call_type: str,
    ) -> dict[str, Any]:
        """Returns parsed assistant JSON object (never raw string)."""
        _validate_json_schema(json_schema)
        model, api_key, chat_url = await self._require_openai_config_for_context(
            context=context,
            call_type=call_type,
        )
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        log.info(
            "llm_chat_structured_start",
            call_type=call_type,
            project_id=str(context.project_id),
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": json_schema,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                r = await client.post(chat_url, headers=headers, json=body)
                if r.status_code >= 400:
                    log.warning(
                        "llm_http_error",
                        **_upstream_error_log_fields(
                            status_code=r.status_code,
                            headers=r.headers,
                            body_text=r.text,
                        ),
                    )
                    raise ApiError(
                        status_code=502,
                        code="LLM_UPSTREAM_ERROR",
                        message="LLM provider returned an error.",
                    )
                data = r.json()
        except httpx.TimeoutException as e:
            log.warning(
                "llm_timeout",
                call_type=call_type,
                project_id=str(context.project_id),
                exc_type=type(e).__name__,
            )
            raise ApiError(
                status_code=504,
                code="LLM_TIMEOUT",
                message=(
                    "The language model did not respond in time. Try again with fewer "
                    "sections or when the provider is less busy."
                ),
            ) from e
        except httpx.RequestError as e:
            log.warning(
                "llm_transport_error",
                call_type=call_type,
                project_id=str(context.project_id),
                exc_type=type(e).__name__,
            )
            raise ApiError(
                status_code=502,
                code="LLM_TRANSPORT_ERROR",
                message="Could not reach the language model service.",
            ) from e

        usage_raw = data.get("usage") or {}
        input_tokens = int(usage_raw.get("prompt_tokens") or 0)
        output_tokens = int(usage_raw.get("completion_tokens") or 0)
        if input_tokens or output_tokens:
            await record_usage(
                self.db,
                context,
                call_type=call_type,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

        choices = data.get("choices") or []
        if not choices:
            raise ApiError(
                status_code=502,
                code="LLM_EMPTY_RESPONSE",
                message="LLM returned no choices.",
            )
        content = choices[0].get("message", {}).get("content") or "{}"
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise ApiError(
                status_code=502,
                code="LLM_INVALID_JSON",
                message="LLM returned invalid JSON.",
            ) from e

    async def chat_stream(
        self,
        *,
        system_prompt: str,
        messages: list[dict[str, Any]],
        context: TokenContext,
        call_type: str,
    ) -> AsyncIterator[str]:
        """Yield assistant token deltas (streaming). Records tokens when usage is returned."""
        model, api_key, chat_url = await self._require_openai_config_for_context(
            context=context,
            call_type=call_type,
        )
        full_messages = [{"role": "system", "content": system_prompt}, *messages]
        body: dict[str, Any] = {
            "model": model,
            "messages": full_messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        assistant_parts: list[str] = []
        usage_final: dict[str, int] | None = None

        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                async with client.stream(
                    "POST",
                    chat_url,
                    headers=headers,
                    json=body,
                ) as resp:
                    if resp.status_code >= 400:
                        text = await resp.aread()
                        body_text = text.decode()
                        log.warning(
                            "llm_stream_http_error",
                            **_upstream_error_log_fields(
                                status_code=resp.status_code,
                                headers=resp.headers,
                                body_text=body_text,
                            ),
                        )
                        raise ApiError(
                            status_code=502,
                            code="LLM_UPSTREAM_ERROR",
                            message="LLM provider returned an error.",
                        )
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        u = chunk.get("usage")
                        if isinstance(u, dict) and u.get("prompt_tokens") is not None:
                            usage_final = {
                                "prompt_tokens": int(u.get("prompt_tokens") or 0),
                                "completion_tokens": int(u.get("completion_tokens") or 0),
                            }
                        choices_ch = chunk.get("choices") or []
                        if not choices_ch:
                            continue
                        delta = choices_ch[0].get("delta") or {}
                        piece = delta.get("content") or ""
                        if piece:
                            assistant_parts.append(piece)
                            yield piece
        except httpx.TimeoutException as e:
            log.warning(
                "llm_stream_timeout",
                call_type=call_type,
                project_id=str(context.project_id),
                exc_type=type(e).__name__,
            )
            raise ApiError(
                status_code=504,
                code="LLM_TIMEOUT",
                message=(
                    "The language model did not respond in time. Try again with fewer "
                    "sections or when the provider is less busy."
                ),
            ) from e
        except httpx.RequestError as e:
            log.warning(
                "llm_stream_transport_error",
                call_type=call_type,
                project_id=str(context.project_id),
                exc_type=type(e).__name__,
            )
            raise ApiError(
                status_code=502,
                code="LLM_TRANSPORT_ERROR",
                message="Could not reach the language model service.",
            ) from e

        full_text = "".join(assistant_parts)
        if usage_final:
            await record_usage(
                self.db,
                context,
                call_type=call_type,
                model=model,
                input_tokens=usage_final["prompt_tokens"],
                output_tokens=usage_final["completion_tokens"],
            )
        elif full_text:
            est_out = max(1, len(full_text) // 4)
            est_in = max(1, sum(len(str(m.get("content", ""))) for m in full_messages) // 4)
            await record_usage(
                self.db,
                context,
                call_type=call_type,
                model=model,
                input_tokens=est_in,
                output_tokens=est_out,
            )

    async def admin_connectivity_probe(
        self,
        *,
        model_override: str | None = None,
        api_base_url_override: str | None = None,
    ) -> AdminConnectivityResult:
        """Tool Admin UI: minimal non-streaming chat completion against stored LLM config.

        Optional ``model_override`` / ``api_base_url_override`` exercise a specific model or host
        (e.g. from the LLM provider registry) while still using the stored API key.

        Does not call :func:`record_usage` — connectivity probes are excluded from
        token accounting dashboards.
        """
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        model = (model_override or "").strip() or (row.llm_model or "").strip()
        key = (row.llm_api_key or "").strip()
        prov = (row.llm_provider or "").strip().lower()
        if not model or not key:
            return AdminConnectivityResult(
                ok=False,
                message="Configure LLM model and API key before testing.",
                detail=None,
            )
        if prov and prov != "openai":
            return AdminConnectivityResult(
                ok=False,
                message=(
                    "Set LLM provider to 'openai' (or leave empty) for OpenAI-compatible APIs."
                ),
                detail=f"Got llm_provider={prov!r}",
            )
        base_for_url = (
            api_base_url_override
            if (api_base_url_override is not None and str(api_base_url_override).strip() != "")
            else row.llm_api_base_url
        )
        chat_url = chat_completions_url(base_for_url)
        body = {
            "model": model,
            "messages": [
                {"role": "user", "content": 'Reply with exactly the word "OK".'}
            ],
            "max_tokens": 32,
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                r = await client.post(
                    chat_url,
                    headers=headers,
                    json=body,
                )
        except httpx.HTTPError as e:
            return AdminConnectivityResult(
                ok=False,
                message="LLM request failed (network or timeout).",
                detail=str(e)[:800],
            )
        if r.status_code >= 400:
            return AdminConnectivityResult(
                ok=False,
                message="LLM provider returned an error.",
                detail=r.text[:800],
            )
        try:
            data = r.json()
        except Exception:
            return AdminConnectivityResult(
                ok=False,
                message="Unexpected LLM response body.",
                detail=r.text[:400],
            )
        choices = data.get("choices") or []
        preview = ""
        if choices:
            preview = (
                (choices[0].get("message") or {}).get("content") or ""
            ).strip()
        return AdminConnectivityResult(
            ok=True,
            message="LLM connection succeeded.",
            detail=preview[:500] if preview else None,
        )

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Delegates to EmbeddingService (same admin embedding config)."""
        return await EmbeddingService(self.db).embed_batch(texts)
