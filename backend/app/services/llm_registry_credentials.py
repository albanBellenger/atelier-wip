"""Resolve OpenAI-compatible HTTP credentials from llm_provider_registry."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import LlmProviderRegistry
from app.openai_compat_urls import openai_v1_base
from app.security.field_encryption import decode_admin_stored_secret
from app.services.litellm_model_id import normalize_litellm_chat_model
from app.services.registry_models_json import first_model_id_from_json, model_ids_from_json


def _models_from_registry_row(pr: LlmProviderRegistry) -> list[str]:
    return model_ids_from_json(pr.models_json)


def _registry_connected(pr: LlmProviderRegistry) -> bool:
    return (pr.status or "").strip().lower() == "connected"


def first_registry_model(row: LlmProviderRegistry | None) -> str | None:
    if row is None:
        return None
    return first_model_id_from_json(row.models_json)


async def load_ordered_registry_providers(
    db: AsyncSession,
) -> list[LlmProviderRegistry]:
    """Stable ordering for model→provider scans (sort_order, then provider_id)."""
    result = await db.execute(
        select(LlmProviderRegistry).order_by(
            LlmProviderRegistry.sort_order,
            LlmProviderRegistry.provider_id,
        )
    )
    return list(result.scalars().all())


async def get_default_llm_registry_row(db: AsyncSession) -> LlmProviderRegistry | None:
    """First registry row with ``is_default`` (tie-break: sort_order, provider_id)."""
    result = await db.execute(
        select(LlmProviderRegistry)
        .where(LlmProviderRegistry.is_default.is_(True))
        .order_by(LlmProviderRegistry.sort_order, LlmProviderRegistry.provider_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def resolve_provider_id_for_model(
    db: AsyncSession,
    model_name: str,
) -> str | None:
    """First connected registry row (ordered) whose model list contains ``model_name``."""
    want = (model_name or "").strip()
    if not want:
        return None
    providers = await load_ordered_registry_providers(db)
    for pr in providers:
        if not _registry_connected(pr):
            continue
        if want in _models_from_registry_row(pr):
            return pr.provider_id
    return None


def _api_base_for_registry_row(row: LlmProviderRegistry) -> str:
    """OpenAI-compatible API root (…/v1) for LiteLLM ``api_base``."""
    base: str | None = None
    if row.api_base_url and str(row.api_base_url).strip():
        base = str(row.api_base_url).strip()
    return openai_v1_base(base)


async def resolve_openai_compatible_llm_credentials(
    db: AsyncSession,
    *,
    effective_model: str,
    route_provider_id: str | None,
) -> tuple[str, str, str, LlmProviderRegistry]:
    """Return ``(model_id, bearer_token, api_base, registry_row)``.

    ``api_base`` is OpenAI v1 root for LiteLLM. Credentials always come from
    ``llm_provider_registry`` (explicit ``route_provider_id`` row, or the default row
    when ``route_provider_id`` is unset).
    """
    model = (effective_model or "").strip()
    if not model:
        raise ApiError(
            status_code=503,
            code="LLM_NOT_CONFIGURED",
            message="Tool Admin must configure LLM model and API key.",
        )

    pk = (route_provider_id or "").strip().lower() or None
    reg_row: LlmProviderRegistry | None = None
    if pk:
        reg_row = await db.scalar(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == pk)
        )
        if reg_row is None:
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM model and API key.",
            )
    else:
        reg_row = await get_default_llm_registry_row(db)
        if reg_row is None:
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM model and API key.",
            )

    key = (decode_admin_stored_secret(reg_row.api_key) or "").strip()
    if not key:
        raise ApiError(
            status_code=503,
            code="LLM_NOT_CONFIGURED",
            message="Tool Admin must configure LLM model and API key.",
        )
    api_base = _api_base_for_registry_row(reg_row)
    return (
        normalize_litellm_chat_model(model, registry_row=reg_row),
        key,
        api_base,
        reg_row,
    )
