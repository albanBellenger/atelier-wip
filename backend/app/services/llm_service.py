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
from app.schemas.token_context import TokenContext
from app.services.embedding_service import EmbeddingService
from app.services.token_tracker import record_usage

log = structlog.get_logger("atelier.llm_service")

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

    async def _require_openai_config(self) -> tuple[str, str, str]:
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
        model, api_key, chat_url = await self._require_openai_config()
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": json_schema,
            },
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        log.info(
            "llm_chat_structured_start",
            call_type=call_type,
            project_id=str(context.project_id),
        )
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                r = await client.post(chat_url, headers=headers, json=body)
                if r.status_code >= 400:
                    log.warning("llm_http_error", status=r.status_code, body=r.text[:500])
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
        model, api_key, chat_url = await self._require_openai_config()
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
                        log.warning(
                            "llm_stream_http_error",
                            status=resp.status_code,
                            body=text.decode()[:500],
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

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Delegates to EmbeddingService (same admin embedding config)."""
        return await EmbeddingService(self.db).embed_batch(texts)
