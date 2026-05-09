"""Central LLM calls via LiteLLM (OpenAI-compatible); integrates TokenTracker."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import litellm
import structlog
from litellm import token_counter as litellm_token_counter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.exceptions import ApiError
from app.models import LlmProviderRegistry
from app.openai_compat_urls import openai_v1_base
from app.schemas.auth import AdminConnectivityResult
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.chat_history_window import (
    history_trim_budget_tokens,
    trim_openai_chat_messages,
)
from app.services.litellm_exception_mapping import (
    map_litellm_exception,
    map_litellm_exception_to_probe_detail,
)
from app.services.llm_registry_credentials import (
    first_registry_model,
    get_default_llm_registry_row,
    resolve_openai_compatible_llm_credentials,
    resolve_provider_id_for_model,
)
from app.services.llm_policy_service import LlmPolicyService
from app.services.registry_models_json import (
    entry_for_litellm_model,
    parse_models_json,
)
from app.services.token_tracker import record_usage

log = structlog.get_logger("atelier.llm_service")

# When ATELIER_LOG_LLM_PROMPTS is true, each message body is capped to this many
# characters in logs to avoid runaway log volume from pathological prompts.
_MAX_LLM_LOG_MESSAGE_CHARS = 100_000


def _stringify_message_content(msg: dict[str, Any]) -> str:
    raw = msg.get("content")
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    return str(raw)


def _per_message_token_counts(
    model: str | None, messages: list[dict[str, Any]]
) -> list[int] | None:
    """Per-message prompt token deltas (prefix cumulative) via LiteLLM; None if counting fails."""
    if not model or not model.strip() or not messages:
        return None
    prev = 0
    counts: list[int] = []
    try:
        for i in range(len(messages)):
            prefix = messages[: i + 1]
            cur = int(litellm_token_counter(model=model, messages=prefix))
            delta = cur - prev
            if delta < 0:
                delta = 0
            counts.append(delta)
            prev = cur
    except Exception:
        log.warning(
            "llm_outbound_token_count_failed",
            model=model,
            message_count=len(messages),
        )
        return None
    return counts


def serialize_outbound_chat_messages_for_debug(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
) -> list[dict[str, Any]]:
    """OpenAI-style role/content pairs with per-body cap (logs and client debug payloads).

    When ``model`` is set, each row may include ``tokens`` (LiteLLM ``token_counter`` deltas).
    """
    token_counts = _per_message_token_counts(model, messages)
    out: list[dict[str, Any]] = []
    for idx, m in enumerate(messages):
        role = str(m.get("role", "user"))
        text = _stringify_message_content(m)
        if len(text) > _MAX_LLM_LOG_MESSAGE_CHARS:
            text = f"{text[:_MAX_LLM_LOG_MESSAGE_CHARS]}…[truncated]"
        row: dict[str, Any] = {"role": role, "content": text}
        if token_counts is not None and idx < len(token_counts):
            row["tokens"] = token_counts[idx]
        out.append(row)
    return out


def _log_outbound_chat_request(
    *,
    messages: list[dict[str, Any]],
    model: str,
    call_source: str,
    usage_scope: TokenUsageScope | None,
    stream: bool,
    json_schema_name: str | None = None,
) -> None:
    """Log outbound LiteLLM chat payloads: safe metadata always; full messages only if configured."""
    roles = [str(m.get("role", "")) for m in messages]
    char_lens = [len(_stringify_message_content(m)) for m in messages]
    if usage_scope is not None:
        scope_payload = {
            "studio_id": str(usage_scope.studio_id),
            "software_id": str(usage_scope.software_id)
            if usage_scope.software_id is not None
            else None,
            "project_id": str(usage_scope.project_id)
            if usage_scope.project_id is not None
            else None,
            "work_order_id": str(usage_scope.work_order_id)
            if usage_scope.work_order_id is not None
            else None,
            "user_id": str(usage_scope.user_id) if usage_scope.user_id is not None else None,
        }
    else:
        scope_payload = {
            "studio_id": None,
            "software_id": None,
            "project_id": None,
            "work_order_id": None,
            "user_id": None,
        }
    payload: dict[str, Any] = {
        "call_source": call_source,
        "model": model,
        "stream": stream,
        "message_roles": roles,
        "message_char_lens": char_lens,
        **scope_payload,
    }
    if json_schema_name is not None:
        payload["json_schema_name"] = json_schema_name
    if get_settings().log_llm_prompts:
        payload["messages"] = serialize_outbound_chat_messages_for_debug(
            messages, model=model
        )
    log.info("llm_outbound_request", **payload)


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


class LLMService:
    """OpenAI chat completions + structured JSON; records token_usage."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _require_openai_config_for_usage_scope(
        self,
        *,
        usage_scope: TokenUsageScope,
        call_source: str,
        preferred_model: str | None = None,
    ) -> tuple[str, str, str, LlmProviderRegistry]:
        policy = LlmPolicyService(self.db)
        await policy.assert_studio_budget(usage_scope.studio_id)
        await policy.assert_builder_budget(usage_scope.studio_id, usage_scope.user_id)
        eff_choice: str | None = None
        if preferred_model and call_source in ("chat", "private_thread"):
            eff_choice = await policy.resolve_preferred_chat_model(
                studio_id=usage_scope.studio_id,
                preferred_model=preferred_model,
            )
        route_model, route_pk = await policy.resolve_effective_llm_route(
            studio_id=usage_scope.studio_id,
            call_source=call_source,
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
            route_pk = await resolve_provider_id_for_model(self.db, eff)
        try:
            model, key, api_base, reg_row = await resolve_openai_compatible_llm_credentials(
                self.db,
                effective_model=eff,
                route_provider_id=route_pk,
            )
        except ApiError as e:
            log.warning(
                "llm_config_rejected",
                reason="missing_model_or_api_key",
                detail=str(e.detail),
            )
            raise
        return model, key, api_base, reg_row

    async def resolved_chat_model_for_scope(
        self,
        *,
        usage_scope: TokenUsageScope,
        call_source: str,
        preferred_model: str | None = None,
    ) -> str:
        """Resolved LiteLLM model id for the same route as :meth:`chat_stream`."""
        model, _, _, _ = await self._require_openai_config_for_usage_scope(
            usage_scope=usage_scope,
            call_source=call_source,
            preferred_model=preferred_model,
        )
        return model

    async def trim_chat_messages_for_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        usage_scope: TokenUsageScope,
        call_source: str,
        preferred_model: str | None = None,
        max_history_tokens: int | None = None,
    ) -> tuple[list[dict[str, Any]], bool]:
        """Trim ``messages`` (no system) to fit token budget; returns ``(msgs, trimmed)``."""
        model, _, _, reg_row = await self._require_openai_config_for_usage_scope(
            usage_scope=usage_scope,
            call_source=call_source,
            preferred_model=preferred_model,
        )
        budget = max_history_tokens
        if budget is None:
            entries = parse_models_json(reg_row.models_json)
            matched = entry_for_litellm_model(
                entries=entries, litellm_model=model, registry_row=reg_row
            )
            budget = history_trim_budget_tokens(
                matched.max_context_tokens if matched is not None else None
            )
        return trim_openai_chat_messages(messages, model=model, max_tokens=budget)

    async def ensure_openai_llm_ready(
        self,
        *,
        usage_scope: TokenUsageScope | None = None,
        call_source: str = "chat",
        preferred_model: str | None = None,
    ) -> None:
        """Validate Tool Admin LLM config before returning a StreamingResponse.

        Streaming endpoints must call this in the route handler *before* constructing
        ``StreamingResponse``: Starlette sends response headers before the stream body
        runs, so :class:`ApiError` raised inside the stream iterator cannot be turned
        into JSON and causes ``RuntimeError: response already started``.
        """
        if usage_scope is None:
            raise ApiError(
                status_code=500,
                code="LLM_USAGE_SCOPE_REQUIRED",
                message="LLM readiness check requires an authenticated usage scope.",
            )
        await self._require_openai_config_for_usage_scope(
            usage_scope=usage_scope,
            call_source=call_source,
            preferred_model=preferred_model,
        )

    async def chat_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        usage_scope: TokenUsageScope,
        call_source: str,
    ) -> dict[str, Any]:
        """Returns parsed assistant JSON object (never raw string)."""
        _validate_json_schema(json_schema)
        model, api_key, api_base, _ = await self._require_openai_config_for_usage_scope(
            usage_scope=usage_scope,
            call_source=call_source,
            preferred_model=None,
        )
        log.info(
            "llm_chat_structured_start",
            call_source=call_source,
            project_id=str(usage_scope.project_id),
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        _log_outbound_chat_request(
            messages=messages,
            model=model,
            call_source=call_source,
            usage_scope=usage_scope,
            stream=False,
            json_schema_name=str(json_schema.get("name") or "").strip() or None,
        )
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
                usage_scope,
                call_source=call_source,
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
        usage_scope: TokenUsageScope,
        call_source: str,
        preferred_model: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield assistant token deltas (streaming). Records tokens when usage is returned."""
        model, api_key, api_base, _ = await self._require_openai_config_for_usage_scope(
            usage_scope=usage_scope,
            call_source=call_source,
            preferred_model=preferred_model,
        )
        full_messages = [{"role": "system", "content": system_prompt}, *messages]
        _log_outbound_chat_request(
            messages=full_messages,
            model=model,
            call_source=call_source,
            usage_scope=usage_scope,
            stream=True,
        )
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
                usage_scope,
                call_source=call_source,
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
                usage_scope,
                call_source=call_source,
                model=model,
                input_tokens=est_in,
                output_tokens=est_out,
            )

    async def admin_connectivity_probe(
        self,
        *,
        model_override: str | None = None,
        api_base_url_override: str | None = None,
        provider_id: str | None = None,
        persist_registry_status: bool = False,
    ) -> AdminConnectivityResult:
        """Tool Admin UI: minimal non-streaming chat completion using registry credentials."""
        pk = (provider_id or "").strip().lower() or None
        explicit_row: LlmProviderRegistry | None = None
        if pk:
            explicit_row = await self.db.scalar(
                select(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == pk)
            )
            if explicit_row is None:
                return AdminConnectivityResult(
                    ok=False,
                    message="Unknown LLM provider ID.",
                    detail=f"No registry row for provider ID «{pk}».",
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
            pk_resolved = await resolve_provider_id_for_model(self.db, model)
        reg_row: LlmProviderRegistry | None = None
        try:
            model_litellm, key, api_base, reg_row = await resolve_openai_compatible_llm_credentials(
                self.db,
                effective_model=model,
                route_provider_id=pk_resolved,
            )
        except ApiError as e:
            d = e.detail
            if persist_registry_status:
                fail_row = explicit_row
                if fail_row is None and pk_resolved:
                    fail_row = await self.db.scalar(
                        select(LlmProviderRegistry).where(
                            LlmProviderRegistry.provider_id == pk_resolved
                        )
                    )
                if fail_row is None:
                    fail_row = await get_default_llm_registry_row(self.db)
                if fail_row is not None:
                    fail_row.status = "needs-key"
                    await self.db.flush()
            return AdminConnectivityResult(
                ok=False,
                message="Configure LLM model and API key before testing.",
                detail=d if isinstance(d, str) else str(d),
            )
        if api_base_url_override is not None and str(api_base_url_override).strip():
            api_base = openai_v1_base(api_base_url_override)
        probe_messages: list[dict[str, Any]] = [
            {"role": "user", "content": 'Reply with exactly the word "OK".'}
        ]
        _log_outbound_chat_request(
            messages=probe_messages,
            model=model_litellm,
            call_source="admin_connectivity_probe",
            usage_scope=None,
            stream=False,
        )
        try:
            response = await litellm.acompletion(
                model=model_litellm,
                messages=probe_messages,
                max_tokens=32,
                api_key=key,
                api_base=api_base,
                timeout=45.0,
            )
        except Exception as e:
            msg, det = map_litellm_exception_to_probe_detail(e)
            if persist_registry_status and reg_row is not None:
                reg_row.status = "needs-key"
                await self.db.flush()
            return AdminConnectivityResult(ok=False, message=msg, detail=det)

        choices = getattr(response, "choices", None) or []
        preview = ""
        if choices:
            msg = getattr(choices[0], "message", None)
            raw = getattr(msg, "content", None) if msg is not None else None
            preview = str(raw or "").strip()
        if persist_registry_status and reg_row is not None:
            reg_row.status = "connected"
            await self.db.flush()
        return AdminConnectivityResult(
            ok=True,
            message="LLM connection succeeded.",
            detail=preview[:500] if preview else None,
        )
