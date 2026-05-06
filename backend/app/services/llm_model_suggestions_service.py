"""LLM model id suggestions: upstream OpenAI-compatible /v1/models + LiteLLM catalog."""

from __future__ import annotations

import json
from typing import Any, Literal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig, LlmProviderRegistry
from app.schemas.admin_console import LlmModelSuggestionItem, LlmModelSuggestionsResponse
from app.services.llm_registry_credentials import (
    assert_openai_compatible_provider_field,
    resolve_openai_compatible_llm_credentials,
)

LITELLM_MODEL_CATALOG_URL = "https://api.litellm.ai/model_catalog"

Mode = Literal["chat", "embedding"]
Source = Literal["auto", "catalog", "upstream"]

_MAX_SUGGESTIONS = 100


def normalize_catalog_model_id(entry: dict[str, Any]) -> str | None:
    raw_id = str(entry.get("id") or "").strip()
    if not raw_id:
        return None
    if "/" in raw_id:
        return raw_id
    prov = str(entry.get("provider") or "").strip().lower()
    if not prov:
        return raw_id
    return f"{prov}/{raw_id}"


def parse_openai_v1_models_body(body: object) -> list[LlmModelSuggestionItem]:
    out: list[LlmModelSuggestionItem] = []
    if not isinstance(body, dict):
        return out
    data = body.get("data")
    if not isinstance(data, list):
        return out
    for row in data:
        if not isinstance(row, dict):
            continue
        mid = str(row.get("id") or "").strip()
        if not mid:
            continue
        out.append(
            LlmModelSuggestionItem(
                id=mid,
                label=mid,
                provider=None,
                source="upstream",
            )
        )
    return out


def parse_catalog_body(body: object) -> list[LlmModelSuggestionItem]:
    out: list[LlmModelSuggestionItem] = []
    if not isinstance(body, dict):
        return out
    data = body.get("data")
    if not isinstance(data, list):
        return out
    for row in data:
        if not isinstance(row, dict):
            continue
        mid = normalize_catalog_model_id(row)
        if not mid:
            continue
        prov = str(row.get("provider") or "").strip().lower() or None
        mmode = row.get("mode")
        extra = f" ({mmode})" if isinstance(mmode, str) and mmode else ""
        out.append(
            LlmModelSuggestionItem(
                id=mid,
                label=f"{mid}{extra}",
                provider=prov,
                source="catalog",
            )
        )
    return out


def _first_models_json_id(models_json: str) -> str | None:
    try:
        raw = json.loads(models_json or "[]")
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, list):
        return None
    for m in raw:
        if isinstance(m, str) and m.strip():
            return m.strip()
    return None


class LlmModelSuggestionsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def suggest(
        self,
        *,
        provider_key: str | None,
        litellm_provider: str | None,
        q: str | None,
        mode: Mode,
        source: Source,
    ) -> LlmModelSuggestionsResponse:
        warnings: list[str] = []
        admin = await self.db.get(AdminConfig, 1)
        if admin is None:
            admin = AdminConfig(id=1)
            self.db.add(admin)
            await self.db.flush()

        reg_row: LlmProviderRegistry | None = None
        pk = (provider_key or "").strip().lower() or None
        if pk:
            reg_row = await self.db.scalar(
                select(LlmProviderRegistry).where(LlmProviderRegistry.provider_key == pk)
            )

        catalog_slug = (litellm_provider or "").strip().lower() or None
        if not catalog_slug and reg_row is not None:
            catalog_slug = (
                (reg_row.litellm_provider_slug or reg_row.provider_key or "").strip().lower()
                or None
            )
        if not catalog_slug:
            catalog_slug = (admin.llm_provider or "openai").strip().lower() or "openai"

        effective_model = ""
        if reg_row is not None:
            effective_model = _first_models_json_id(reg_row.models_json) or ""
        if not effective_model:
            effective_model = (admin.llm_model or "").strip()
        if not effective_model:
            effective_model = "gpt-4o-mini"

        merged: dict[str, LlmModelSuggestionItem] = {}

        want_upstream = source in ("auto", "upstream")
        want_catalog = source in ("auto", "catalog")

        if want_upstream:
            try:
                assert_openai_compatible_provider_field(admin)
            except ApiError as e:
                wmsg = str(e.detail) if isinstance(e.detail, str) else "Invalid LLM provider config."
                warnings.append(wmsg)
            else:
                try:
                    _norm_model, key, api_base = await resolve_openai_compatible_llm_credentials(
                        self.db,
                        admin=admin,
                        effective_model=effective_model,
                        route_provider_key=pk,
                    )
                except ApiError as e:
                    wmsg = str(e.detail) if isinstance(e.detail, str) else str(e)
                    warnings.append(f"Upstream credentials unavailable: {wmsg}")
                else:
                    url = f"{api_base.rstrip('/')}/models"
                    try:
                        async with httpx.AsyncClient(timeout=15.0) as client:
                            resp = await client.get(
                                url,
                                headers={"Authorization": f"Bearer {key}"},
                            )
                        if resp.status_code == 200:
                            for it in parse_openai_v1_models_body(resp.json()):
                                merged[it.id] = it
                        else:
                            warnings.append(
                                f"Upstream /v1/models returned HTTP {resp.status_code}."
                            )
                    except Exception as e:
                        warnings.append(f"Upstream model list failed: {str(e)[:200]}")

        need_catalog = want_catalog and (
            source == "catalog" or (source == "auto" and len(merged) == 0)
        )
        if need_catalog:
            params: dict[str, Any] = {
                "provider": catalog_slug,
                "mode": mode,
                "page_size": 50,
            }
            qstrip = (q or "").strip()
            if qstrip:
                params["model"] = qstrip
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(LITELLM_MODEL_CATALOG_URL, params=params)
                if resp.status_code == 200:
                    catalog_items = parse_catalog_body(resp.json())
                    if qstrip:
                        ql = qstrip.lower()
                        catalog_items = [
                            c
                            for c in catalog_items
                            if ql in c.id.lower() or (c.label and ql in c.label.lower())
                        ]
                    for it in catalog_items:
                        if it.id not in merged:
                            merged[it.id] = it
                else:
                    warnings.append(f"LiteLLM catalog returned HTTP {resp.status_code}.")
            except Exception as e:
                warnings.append(f"LiteLLM catalog request failed: {str(e)[:200]}")

        items = sorted(merged.values(), key=lambda x: x.id.lower())
        warn_str = "; ".join(warnings) if warnings else None
        return LlmModelSuggestionsResponse(models=items[:_MAX_SUGGESTIONS], warning=warn_str)
