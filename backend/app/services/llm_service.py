"""Central LLM calls via LiteLLM (OpenAI-compatible); integrates TokenTracker."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import litellm
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import LlmProviderRegistry
from app.openai_compat_urls import openai_v1_base
from app.schemas.auth import AdminConnectivityResult
from app.schemas.token_context import TokenContext
from app.services.chat_history_window import (
    DEFAULT_CHAT_HISTORY_MAX_TOKENS,
    trim_openai_chat_messages,
)
from app.services.embedding_service import EmbeddingService
from app.services.litellm_exception_mapping import (
    map_litellm_exception,
    map_litellm_exception_to_probe_detail,
)
from app.services.llm_registry_credentials import (
    first_registry_model,
    get_default_llm_registry_row,
    resolve_openai_compatible_llm_credentials,
    resolve_provider_key_for_model,
)
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


def _chunk_delta_text(chunk: Any) -> str:
    choices = getattr(chunk, "choices", None)
    if choices is None and isinstance(chunk, dict):
        choices = chunk.get("choices")
    if not choices:
        return ""
    c0 = choices[0]
    delta = getattr(c0, "delta", None) if not isinstance(c0, dict) else c0.get("delta")
    if delta is None:
        return ""
    if isinstance(delta, dict):
        return str(delta.get("content") or "")
    return str(getattr(delta, "content", None) or "")


def _chunk_usage_tokens(chunk: Any) -> dict[str, int] | None:
    u = getattr(chunk, "usage", None)
    if u is None and isinstance(chunk, dict):
        u = chunk.get("usage")
    if not isinstance(u, dict) or u.get("prompt_tokens") is None:
        return None
    return {
        "prompt_tokens": int(u.get("prompt_tokens") or 0),
        "completion_tokens": int(u.get("completion_tokens") or 0),
    }


def _optional_completion_cost_usd(response: Any) -> Decimal | None:
    try:
        cost = litellm.completion_cost(completion_response=response)
    except Exception:
        return None
    if cost is None:
        return None
    try:
        return Decimal(str(cost)).quantize(Decimal("0.000001"))
    except Exception:
        return None


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
        preferred_model: str | None = None,
    ) -> tuple[str, str, str]:
        policy = LlmPolicyService(self.db)
        await policy.assert_studio_budget(context.studio_id)
        await policy.assert_builder_budget(context.studio_id, context.user_id)
        eff_choice: str | None = None
        if preferred_model and call_type in ("chat", "private_thread"):
            eff_choice = await policy.resolve_preferred_chat_model(
                studio_id=context.studio_id,
                preferred_model=preferred_model,
            )
        route_model, route_pk = await policy.resolve_effective_llm_route(
            studio_id=context.studio_id,
            call_type=call_type,
        )
        eff = (route_model or "").strip()
        if eff_choice:
            eff = eff_choice
        if not eff:
            def_row = await get_default_llm_registry_row(self.db)
            eff = (first_registry_model(def_row) or "").strip()
        if not eff:
            log.warning("llm_config_rejected", reason="no_default_registry_model")
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM provider, model, and API key.",
            )
        if not route_pk and eff:
            route_pk = await resolve_provider_key_for_model(self.db, eff)
        try:
            model, key, api_base = await resolve_openai_compatible_llm_credentials(
                self.db,
                effective_model=eff,
                route_provider_key=route_pk,
            )
        except ApiError as e:
            log.warning(
                "llm_config_rejected",
                reason="missing_model_or_api_key",
                detail=str(e.detail),
            )
            raise
        return model, key, api_base

    async def trim_chat_messages_for_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        context: TokenContext,
        call_type: str,
        preferred_model: str | None = None,
        max_history_tokens: int = DEFAULT_CHAT_HISTORY_MAX_TOKENS,
    ) -> tuple[list[dict[str, Any]], bool]:
        """Trim ``messages`` (no system) to fit token budget; returns ``(msgs, trimmed)``."""
        model, _, _ = await self._require_openai_config_for_context(
            context=context,
            call_type=call_type,
            preferred_model=preferred_model,
        )
        return trim_openai_chat_messages(
            messages, model=model, max_tokens=max_history_tokens
        )

    async def ensure_openai_llm_ready(
        self,
        *,
        context: TokenContext | None = None,
        call_type: str = "chat",
        preferred_model: str | None = None,
    ) -> None:
        """Validate Tool Admin LLM config before returning a StreamingResponse.

        Streaming endpoints must call this in the route handler *before* constructing
        ``StreamingResponse``: Starlette sends response headers before the stream body
        runs, so :class:`ApiError` raised inside the stream iterator cannot be turned
        into JSON and causes ``RuntimeError: response already started``.
        """
        if context is None:
            raise ApiError(
                status_code=500,
                code="LLM_CONTEXT_REQUIRED",
                message="LLM readiness check requires an authenticated token context.",
            )
        await self._require_openai_config_for_context(
            context=context,
            call_type=call_type,
            preferred_model=preferred_model,
        )

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
        model, api_key, api_base = await self._require_openai_config_for_context(
            context=context,
            call_type=call_type,
            preferred_model=None,
        )
        log.info(
            "llm_chat_structured_start",
            call_type=call_type,
            project_id=str(context.project_id),
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            response = await litellm.acompletion(
                model=model,
                messages=messages,
                api_key=api_key,
                api_base=api_base,
                response_format={
                    "type": "json_schema",
                    "json_schema": json_schema,
                },
                timeout=180.0,
            )
        except Exception as e:
            raise map_litellm_exception(e, family="chat") from e

        usage_raw = getattr(response, "usage", None)
        ud: dict[str, Any]
        if usage_raw is not None and hasattr(usage_raw, "model_dump"):
            ud = usage_raw.model_dump()
        elif isinstance(usage_raw, dict):
            ud = usage_raw
        else:
            ud = {}
        input_tokens = int(ud.get("prompt_tokens") or 0)
        output_tokens = int(ud.get("completion_tokens") or 0)
        cost_override = _optional_completion_cost_usd(response)
        if input_tokens or output_tokens:
            await record_usage(
                self.db,
                context,
                call_type=call_type,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                estimated_cost_override=cost_override,
            )

        choices = getattr(response, "choices", None) or []
        if not choices:
            raise ApiError(
                status_code=502,
                code="LLM_EMPTY_RESPONSE",
                message="LLM returned no choices.",
            )
        msg = getattr(choices[0], "message", None)
        if msg is not None and hasattr(msg, "model_dump"):
            mdict = msg.model_dump()
            content = mdict.get("content") or "{}"
        elif isinstance(msg, dict):
            content = msg.get("content") or "{}"
        else:
            content = getattr(msg, "content", None) or "{}"
        if not isinstance(content, str):
            content = str(content or "{}")
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
        preferred_model: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield assistant token deltas (streaming). Records tokens when usage is returned."""
        model, api_key, api_base = await self._require_openai_config_for_context(
            context=context,
            call_type=call_type,
            preferred_model=preferred_model,
        )
        full_messages = [{"role": "system", "content": system_prompt}, *messages]
        assistant_parts: list[str] = []
        usage_final: dict[str, int] | None = None

        try:
            stream = await litellm.acompletion(
                model=model,
                messages=full_messages,
                stream=True,
                stream_options={"include_usage": True},
                api_key=api_key,
                api_base=api_base,
                timeout=180.0,
            )
            async for chunk in stream:
                u = _chunk_usage_tokens(chunk)
                if u is not None:
                    usage_final = u
                piece = _chunk_delta_text(chunk)
                if piece:
                    assistant_parts.append(piece)
                    yield piece
        except Exception as e:
            raise map_litellm_exception(e, family="chat") from e

        full_text = "".join(assistant_parts)
        if usage_final:
            cost_override: Decimal | None = None
            try:
                raw_cost = litellm.completion_cost(
                    completion_response=None,
                    model=model,
                    messages=full_messages,
                    completion=full_text,
                )
                if raw_cost is not None:
                    cost_override = Decimal(str(raw_cost)).quantize(Decimal("0.000001"))
            except Exception:
                cost_override = None
            await record_usage(
                self.db,
                context,
                call_type=call_type,
                model=model,
                input_tokens=usage_final["prompt_tokens"],
                output_tokens=usage_final["completion_tokens"],
                estimated_cost_override=cost_override,
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
        provider_key: str | None = None,
    ) -> AdminConnectivityResult:
        """Tool Admin UI: minimal non-streaming chat completion using registry credentials."""
        pk = (provider_key or "").strip().lower() or None
        explicit_row: LlmProviderRegistry | None = None
        if pk:
            explicit_row = await self.db.scalar(
                select(LlmProviderRegistry).where(LlmProviderRegistry.provider_key == pk)
            )
            if explicit_row is None:
                return AdminConnectivityResult(
                    ok=False,
                    message="Unknown LLM provider_key.",
                    detail=f"No registry row for provider_key «{pk}».",
                )
        model = (model_override or "").strip()
        if not model:
            model = (first_registry_model(explicit_row) or "").strip()
        if not model:
            def_row = await get_default_llm_registry_row(self.db)
            model = (first_registry_model(def_row) or "").strip()
        if not model:
            return AdminConnectivityResult(
                ok=False,
                message="No LLM model configured.",
                detail=(
                    "Add models to the default provider in Admin Console → LLM, "
                    "or pass model in the probe body."
                ),
            )
        pk_resolved = pk
        if not pk_resolved and model:
            pk_resolved = await resolve_provider_key_for_model(self.db, model)
        try:
            model_litellm, key, api_base = await resolve_openai_compatible_llm_credentials(
                self.db,
                effective_model=model,
                route_provider_key=pk_resolved,
            )
        except ApiError as e:
            d = e.detail
            return AdminConnectivityResult(
                ok=False,
                message="Configure LLM model and API key before testing.",
                detail=d if isinstance(d, str) else str(d),
            )
        if api_base_url_override is not None and str(api_base_url_override).strip():
            api_base = openai_v1_base(api_base_url_override)
        try:
            response = await litellm.acompletion(
                model=model_litellm,
                messages=[
                    {"role": "user", "content": 'Reply with exactly the word "OK".'}
                ],
                max_tokens=32,
                api_key=key,
                api_base=api_base,
                timeout=45.0,
            )
        except Exception as e:
            msg, det = map_litellm_exception_to_probe_detail(e)
            return AdminConnectivityResult(ok=False, message=msg, detail=det)

        choices = getattr(response, "choices", None) or []
        preview = ""
        if choices:
            msg = getattr(choices[0], "message", None)
            raw = getattr(msg, "content", None) if msg is not None else None
            preview = str(raw or "").strip()
        return AdminConnectivityResult(
            ok=True,
            message="LLM connection succeeded.",
            detail=preview[:500] if preview else None,
        )

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Delegates to EmbeddingService (same admin embedding config)."""
        return await EmbeddingService(self.db).embed_batch(texts)
