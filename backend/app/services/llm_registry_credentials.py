"""Resolve OpenAI-compatible HTTP credentials from registry rows + admin_config fallback."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig, LlmProviderRegistry
from app.openai_compat_urls import chat_completions_url
from app.security.field_encryption import decode_admin_stored_secret


def _models_from_registry_row(pr: LlmProviderRegistry) -> list[str]:
    try:
        raw = json.loads(pr.models_json or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    return [str(m) for m in raw if isinstance(m, str) and m.strip()]


def _registry_connected(pr: LlmProviderRegistry) -> bool:
    return (pr.status or "").strip().lower() == "connected"


async def load_ordered_registry_providers(
    db: AsyncSession,
) -> list[LlmProviderRegistry]:
    """Stable ordering for model→provider scans (sort_order, then provider_key)."""
    result = await db.execute(
        select(LlmProviderRegistry).order_by(
            LlmProviderRegistry.sort_order,
            LlmProviderRegistry.provider_key,
        )
    )
    return list(result.scalars().all())


async def resolve_provider_key_for_model(
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
            return pr.provider_key
    return None


def _chat_url_for_registry_row(
    row: LlmProviderRegistry | None, admin: AdminConfig
) -> str:
    base = None
    if row is not None and row.api_base_url and str(row.api_base_url).strip():
        base = str(row.api_base_url).strip()
    else:
        base = (admin.llm_api_base_url or "").strip() or None
    return chat_completions_url(base)


async def resolve_openai_compatible_llm_credentials(
    db: AsyncSession,
    *,
    admin: AdminConfig,
    effective_model: str,
    route_provider_key: str | None,
) -> tuple[str, str, str]:
    """Return ``(model_id, bearer_token, chat_completions_url)``.

    Uses per-registry ``api_key`` when set and non-empty after decode; otherwise falls back
    to ``admin.llm_api_key``. Base URL: registry ``api_base_url`` when set, else admin default.
    """
    model = (effective_model or "").strip()
    if not model:
        raise ApiError(
            status_code=503,
            code="LLM_NOT_CONFIGURED",
            message="Tool Admin must configure LLM model and API key.",
        )

    pk = (route_provider_key or "").strip().lower() or None
    reg_row: LlmProviderRegistry | None = None
    if pk:
        reg_row = await db.scalar(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_key == pk)
        )

    admin_key = (decode_admin_stored_secret(admin.llm_api_key) or "").strip()

    if reg_row is not None:
        row_key = (decode_admin_stored_secret(reg_row.api_key) or "").strip()
        key = row_key or admin_key
        if not key:
            raise ApiError(
                status_code=503,
                code="LLM_NOT_CONFIGURED",
                message="Tool Admin must configure LLM model and API key.",
            )
        chat_url = _chat_url_for_registry_row(reg_row, admin)
        return model, key, chat_url

    key = admin_key
    if not key:
        raise ApiError(
            status_code=503,
            code="LLM_NOT_CONFIGURED",
            message="Tool Admin must configure LLM model and API key.",
        )
    chat_url = chat_completions_url(admin.llm_api_base_url)
    return model, key, chat_url


def assert_openai_compatible_provider_field(admin: AdminConfig) -> None:
    """Reject non-OpenAI-compatible provider labels (legacy admin_config check)."""
    prov = (admin.llm_provider or "").strip().lower()
    if prov and prov != "openai":
        raise ApiError(
            status_code=503,
            code="LLM_PROVIDER_UNSUPPORTED",
            message=(
                "Set llm_provider to 'openai' (or leave empty) for OpenAI-compatible APIs; "
                "use LLM API base URL for a custom endpoint."
            ),
        )
