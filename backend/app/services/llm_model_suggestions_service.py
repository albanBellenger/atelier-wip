"""LLM model id suggestions: upstream OpenAI-compatible /v1/models + LiteLLM catalog."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Literal, Sequence

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import LlmProviderRegistry
from app.schemas.admin_console import LlmModelSuggestionItem, LlmModelSuggestionsResponse
from app.services.llm_registry_credentials import (
    get_default_llm_registry_row,
    resolve_openai_compatible_llm_credentials,
)
from app.services.registry_models_json import first_model_id_from_json, model_ids_from_json

LITELLM_MODEL_CATALOG_URL = "https://api.litellm.ai/model_catalog"

Mode = Literal["chat", "embedding"]
Source = Literal["auto", "catalog", "upstream", "registry"]

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


def _registry_row_slug(row: LlmProviderRegistry) -> str:
    return (row.litellm_provider_slug or row.provider_id or "").strip().lower()


def collect_registry_suggestions(
    rows: Sequence[LlmProviderRegistry],
    *,
    provider_id_filter: str | None,
    litellm_provider_filter: str | None,
    q: str | None,
) -> tuple[list[LlmModelSuggestionItem], list[str]]:
    """Model ids from ``LlmProviderRegistry.models_json`` (LLM deployment), optional filters."""
    warnings: list[str] = []
    pk_f = (provider_id_filter or "").strip().lower() or None
    slug_f = (litellm_provider_filter or "").strip().lower() or None
    ql = (q or "").strip().lower()

    filtered: list[LlmProviderRegistry] = []
    for row in rows:
        if pk_f and row.provider_id.lower() != pk_f:
            continue
        if slug_f and _registry_row_slug(row) != slug_f:
            continue
        filtered.append(row)

    if rows and not filtered and (pk_f or slug_f):
        warnings.append("No registry provider matched this filter.")

    mid_entries: dict[str, list[str]] = defaultdict(list)
    seen_pk: dict[str, set[str]] = defaultdict(set)

    for row in filtered:
        pk = row.provider_id
        pk_lower = pk.lower()
        for mid in model_ids_from_json(row.models_json):
            m = mid.strip()
            if not m:
                continue
            if ql and ql not in m.lower():
                continue
            if pk_lower in seen_pk[m]:
                continue
            seen_pk[m].add(pk_lower)
            mid_entries[m].append(pk)

    out: list[LlmModelSuggestionItem] = []
    for mid in sorted(mid_entries.keys(), key=str.lower):
        prov_ids = sorted(set(mid_entries[mid]), key=str.lower)
        if len(prov_ids) == 1:
            out.append(
                LlmModelSuggestionItem(
                    id=mid,
                    label=f"{mid} ({prov_ids[0]})",
                    provider=prov_ids[0].lower(),
                    source="registry",
                )
            )
        else:
            out.append(
                LlmModelSuggestionItem(
                    id=mid,
                    label=f"{mid} ({', '.join(prov_ids)})",
                    provider=None,
                    source="registry",
                )
            )
            warnings.append(
                f"Model id {mid!r} appears on multiple registry providers ({', '.join(prov_ids)})."
            )

    return out[:_MAX_SUGGESTIONS], warnings


class LlmModelSuggestionsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def suggest(
        self,
        *,
        provider_id: str | None,
        litellm_provider: str | None,
        q: str | None,
        mode: Mode,
        source: Source,
    ) -> LlmModelSuggestionsResponse:
        if source == "registry":
            return await self._suggest_registry(
                provider_id=provider_id,
                litellm_provider=litellm_provider,
                q=q,
            )

        warnings: list[str] = []
        reg_row: LlmProviderRegistry | None = None
        pk = (provider_id or "").strip().lower() or None
        if pk:
            reg_row = await self.db.scalar(
                select(LlmProviderRegistry).where(
                    func.lower(LlmProviderRegistry.provider_id) == pk
                )
            )

        catalog_slug = (litellm_provider or "").strip().lower() or None
        if not catalog_slug and reg_row is not None:
            catalog_slug = (
                (reg_row.litellm_provider_slug or reg_row.provider_id or "").strip().lower()
                or None
            )
        if not catalog_slug and pk:
            # Register-provider flow: row may not exist yet; use key as catalog filter (not openai).
            catalog_slug = pk

        effective_model = ""
        if reg_row is not None:
            effective_model = first_model_id_from_json(reg_row.models_json) or ""
        if not effective_model:
            def_row = await get_default_llm_registry_row(self.db)
            if def_row is not None:
                effective_model = first_model_id_from_json(def_row.models_json) or ""
        if not effective_model:
            effective_model = "gpt-4o-mini"

        merged: dict[str, LlmModelSuggestionItem] = {}

        want_upstream = source in ("auto", "upstream")
        want_catalog = source in ("auto", "catalog")

        if want_upstream:
            try:
                _norm_model, key, api_base, _ = await resolve_openai_compatible_llm_credentials(
                    self.db,
                    effective_model=effective_model,
                    route_provider_id=pk,
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
                "mode": mode,
                "page_size": 50,
            }
            if catalog_slug:
                params["provider"] = catalog_slug
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

    async def _suggest_registry(
        self,
        *,
        provider_id: str | None,
        litellm_provider: str | None,
        q: str | None,
    ) -> LlmModelSuggestionsResponse:
        result = await self.db.execute(
            select(LlmProviderRegistry).order_by(
                LlmProviderRegistry.sort_order,
                LlmProviderRegistry.provider_id,
            )
        )
        rows = list(result.scalars().all())
        if not rows:
            return LlmModelSuggestionsResponse(
                models=[],
                warning="No LLM providers are registered on this deployment.",
            )
        items, extra_warnings = collect_registry_suggestions(
            rows,
            provider_id_filter=(provider_id or "").strip().lower() or None,
            litellm_provider_filter=(litellm_provider or "").strip().lower() or None,
            q=q,
        )
        if not items:
            if extra_warnings:
                return LlmModelSuggestionsResponse(
                    models=[],
                    warning="; ".join(extra_warnings),
                )
            qs = (q or "").strip()
            if qs:
                warn = f"No deployment models matched query {qs!r}."
            else:
                warn = "No model IDs are configured on LLM provider registry rows."
            return LlmModelSuggestionsResponse(models=[], warning=warn)
        warn_str = "; ".join(extra_warnings) if extra_warnings else None
        return LlmModelSuggestionsResponse(models=items, warning=warn_str)
