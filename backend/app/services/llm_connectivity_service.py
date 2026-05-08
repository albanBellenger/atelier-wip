"""Admin CRUD for LLM provider registry, routing rules, studio matrix."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmProviderRegistry, LlmRoutingRule, StudioLlmProviderPolicy
from app.schemas.admin_console import (
    LlmProviderRegistryResponse,
    LlmProviderRegistryUpdate,
    LlmRoutingRuleResponse,
    LlmRoutingRuleUpdate,
    StudioLlmPolicyUpdate,
    StudioLlmPolicyRowResponse,
)
from app.security.field_encryption import admin_secret_suffix_hint, decode_admin_stored_secret, encode_admin_stored_secret
from app.services.litellm_model_context import enrich_model_entries_from_litellm
from app.services.llm_provider_logo_service import resolve_llm_provider_logo_url
from app.services.llm_service import LLMService
from app.services.registry_models_json import (
    first_model_id_from_json,
    parse_models_json,
    serialize_models_json,
)


def _mask_secret(s: str | None) -> bool:
    return bool(s and s.strip())


class LlmConnectivityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _row_to_out(
        self,
        row: LlmProviderRegistry,
        *,
        save_warnings: list[str] | None = None,
    ) -> LlmProviderRegistryResponse:
        models = parse_models_json(row.models_json)
        return LlmProviderRegistryResponse(
            id=row.id,
            provider_key=row.provider_key,
            display_name=row.display_name,
            models=models,
            api_base_url=row.api_base_url,
            logo_url=row.logo_url,
            status=row.status,
            is_default=row.is_default,
            sort_order=row.sort_order,
            llm_api_key_set=_mask_secret(row.api_key),
            llm_api_key_hint=admin_secret_suffix_hint(row.api_key),
            litellm_provider_slug=row.litellm_provider_slug,
            save_warnings=list(save_warnings) if save_warnings else [],
        )

    async def list_providers(self) -> list[LlmProviderRegistryResponse]:
        rows = (
            (
                await self.db.execute(
                    select(LlmProviderRegistry).order_by(
                        LlmProviderRegistry.sort_order, LlmProviderRegistry.provider_key
                    )
                )
            )
            .scalars()
            .all()
        )
        return [self._row_to_out(r) for r in rows]

    async def upsert_provider(
        self,
        provider_key: str,
        body: LlmProviderRegistryUpdate,
    ) -> LlmProviderRegistryResponse:
        pk = provider_key.strip().lower()
        row = await self.db.scalar(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_key == pk)
        )
        save_warnings: list[str] = []
        reg: LlmProviderRegistry

        if row:
            row.display_name = body.display_name
            api_raw = body.api_base_url.strip() if body.api_base_url else ""
            row.api_base_url = api_raw or None
            row.status = body.status
            row.is_default = body.is_default
            row.sort_order = body.sort_order
            if "llm_api_key" in body.model_fields_set:
                if body.llm_api_key is None:
                    row.api_key = None
                elif str(body.llm_api_key).strip() == "":
                    row.api_key = None
                else:
                    row.api_key = encode_admin_stored_secret(str(body.llm_api_key).strip())
            if "litellm_provider_slug" in body.model_fields_set:
                raw_slug = body.litellm_provider_slug
                row.litellm_provider_slug = (
                    None
                    if raw_slug is None
                    else (str(raw_slug).strip() or None)
                )
            await self.db.flush()
            row.logo_url = resolve_llm_provider_logo_url(
                provider_key=pk,
                api_base_url=row.api_base_url,
            )
            await self.db.flush()
            enriched = enrich_model_entries_from_litellm(
                list(body.models), draft_registry_row=row
            )
            row.models_json = serialize_models_json(enriched)
            await self.db.flush()
            reg = row
        else:
            api_raw = body.api_base_url.strip() if body.api_base_url else ""
            api_key_val: str | None = None
            if "llm_api_key" in body.model_fields_set and body.llm_api_key is not None:
                if str(body.llm_api_key).strip() == "":
                    api_key_val = None
                else:
                    api_key_val = encode_admin_stored_secret(str(body.llm_api_key).strip())
            slug_val: str | None = None
            if "litellm_provider_slug" in body.model_fields_set:
                raw_slug = body.litellm_provider_slug
                slug_val = None if raw_slug is None else (str(raw_slug).strip() or None)
            ent = LlmProviderRegistry(
                id=uuid4(),
                provider_key=pk,
                display_name=body.display_name,
                models_json=serialize_models_json(list(body.models)),
                api_base_url=api_raw or None,
                api_key=api_key_val,
                status=body.status,
                is_default=body.is_default,
                sort_order=body.sort_order,
                litellm_provider_slug=slug_val,
            )
            self.db.add(ent)
            await self.db.flush()
            ent.logo_url = resolve_llm_provider_logo_url(
                provider_key=pk,
                api_base_url=ent.api_base_url,
            )
            await self.db.flush()
            enriched = enrich_model_entries_from_litellm(
                list(body.models), draft_registry_row=ent
            )
            ent.models_json = serialize_models_json(enriched)
            await self.db.flush()
            reg = ent

        probe_id = first_model_id_from_json(reg.models_json)
        if probe_id and (decode_admin_stored_secret(reg.api_key) or "").strip():
            probe = await LLMService(self.db).admin_connectivity_probe(
                provider_key=pk,
                model_override=probe_id,
            )
            if not probe.ok:
                detail = probe.detail if isinstance(probe.detail, str) else str(probe.detail or "")
                save_warnings.append(
                    f"{probe.message}{f' ({detail})' if detail.strip() else ''}"
                )

        return self._row_to_out(reg, save_warnings=save_warnings)

    async def delete_provider(self, provider_key: str) -> None:
        await self.db.execute(
            delete(LlmProviderRegistry).where(LlmProviderRegistry.provider_key == provider_key)
        )
        await self.db.flush()

    async def list_routing(self) -> list[LlmRoutingRuleResponse]:
        rows = (await self.db.execute(select(LlmRoutingRule))).scalars().all()
        return [
            LlmRoutingRuleResponse(
                use_case=r.use_case,
                primary_model=r.primary_model,
                fallback_model=r.fallback_model,
            )
            for r in rows
        ]

    async def put_routing(self, body: LlmRoutingRuleUpdate) -> list[LlmRoutingRuleResponse]:
        await self.db.execute(delete(LlmRoutingRule))
        for rule in body.rules:
            self.db.add(
                LlmRoutingRule(
                    use_case=rule.use_case[:32],
                    primary_model=rule.primary_model,
                    fallback_model=rule.fallback_model,
                )
            )
        await self.db.flush()
        return await self.list_routing()

    async def get_studio_policy(self, studio_id: UUID) -> list[StudioLlmPolicyRowResponse]:
        rows = (
            (
                await self.db.execute(
                    select(StudioLlmProviderPolicy).where(
                        StudioLlmProviderPolicy.studio_id == studio_id
                    )
                )
            )
            .scalars()
            .all()
        )
        return [
            StudioLlmPolicyRowResponse(
                provider_key=r.provider_key,
                enabled=r.enabled,
                selected_model=r.selected_model,
            )
            for r in rows
        ]

    async def put_studio_policy(
        self, studio_id: UUID, body: StudioLlmPolicyUpdate
    ) -> list[StudioLlmPolicyRowResponse]:
        await self.db.execute(
            delete(StudioLlmProviderPolicy).where(
                StudioLlmProviderPolicy.studio_id == studio_id
            )
        )
        for row in body.rows:
            self.db.add(
                StudioLlmProviderPolicy(
                    studio_id=studio_id,
                    provider_key=row.provider_key,
                    enabled=row.enabled,
                    selected_model=row.selected_model,
                )
            )
        await self.db.flush()
        return await self.get_studio_policy(studio_id)
