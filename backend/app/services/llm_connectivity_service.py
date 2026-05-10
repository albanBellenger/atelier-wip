"""Admin CRUD for LLM provider registry, routing rules, studio matrix."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import LlmProviderRegistry, LlmRoutingRule, StudioLlmProviderPolicy
from app.schemas.llm_registry_model import LlmRegistryModelKind
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
    first_model_id_for_kind,
    model_ids_for_kind,
    parse_models_json,
    serialize_models_json,
)


def _mask_secret(s: str | None) -> bool:
    return bool(s and s.strip())


def _norm_status(s: str | None) -> str:
    return (s or "").strip().lower()


def _registry_hosts_model_for_kind(
    providers: list[LlmProviderRegistry],
    model_id: str,
    kind: LlmRegistryModelKind,
) -> bool:
    want = (model_id or "").strip()
    if not want:
        return True
    for pr in providers:
        if _norm_status(pr.status) != "connected":
            continue
        if want in model_ids_for_kind(pr.models_json, kind):
            return True
    return False


_DEFAULT_STALE_WARNING = (
    "Default was cleared: only a connected provider can be the platform default."
)


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
            provider_id=row.provider_id,
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
                        LlmProviderRegistry.sort_order, LlmProviderRegistry.provider_id
                    )
                )
            )
            .scalars()
            .all()
        )
        return [self._row_to_out(r) for r in rows]

    async def upsert_provider(
        self,
        provider_id: str,
        body: LlmProviderRegistryUpdate,
    ) -> LlmProviderRegistryResponse:
        pk = provider_id.strip().lower()
        row = await self.db.scalar(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == pk)
        )
        save_warnings: list[str] = []
        reg: LlmProviderRegistry

        if row:
            old_status = _norm_status(row.status)
            old_models_json = row.models_json
            old_api_base = row.api_base_url
            old_slug = row.litellm_provider_slug
            old_has_key = _mask_secret(row.api_key)

            api_raw = body.api_base_url.strip() if body.api_base_url else ""
            row.api_base_url = api_raw or None
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
                provider_id=pk,
                api_base_url=row.api_base_url,
            )
            await self.db.flush()
            enriched = enrich_model_entries_from_litellm(
                list(body.models), draft_registry_row=row
            )
            row.models_json = serialize_models_json(enriched)
            await self.db.flush()
            reg = row

            new_has_key = _mask_secret(row.api_key)
            key_material = False
            if "llm_api_key" in body.model_fields_set:
                if body.llm_api_key is None or str(body.llm_api_key).strip() == "":
                    key_material = old_has_key
                else:
                    key_material = True

            material_change = (
                old_models_json != row.models_json
                or (old_api_base or "") != (row.api_base_url or "")
                or (old_slug or "") != (row.litellm_provider_slug or "")
                or key_material
            )

            if "disabled" in body.model_fields_set and body.disabled is True:
                reg.status = "disabled"
            elif (
                "disabled" in body.model_fields_set
                and body.disabled is False
                and old_status == "disabled"
            ):
                reg.status = "needs-key"
            elif old_status == "disabled":
                reg.status = "disabled"
            elif not new_has_key:
                reg.status = "needs-key"
            elif old_status == "connected" and material_change:
                reg.status = "needs-key"
            await self.db.flush()
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
                provider_id=pk,
                models_json=serialize_models_json(list(body.models)),
                api_base_url=api_raw or None,
                api_key=api_key_val,
                status="needs-key",
                is_default=body.is_default,
                sort_order=body.sort_order,
                litellm_provider_slug=slug_val,
            )
            self.db.add(ent)
            await self.db.flush()
            ent.logo_url = resolve_llm_provider_logo_url(
                provider_id=pk,
                api_base_url=ent.api_base_url,
            )
            await self.db.flush()
            enriched = enrich_model_entries_from_litellm(
                list(body.models), draft_registry_row=ent
            )
            ent.models_json = serialize_models_json(enriched)
            await self.db.flush()
            reg = ent

        await self._sync_default_flag_with_status(reg, pk, save_warnings)

        probe_id = first_model_id_for_kind(reg.models_json, "chat")
        status_after = _norm_status(reg.status)
        if (
            probe_id
            and (decode_admin_stored_secret(reg.api_key) or "").strip()
            and status_after != "disabled"
        ):
            probe = await LLMService(self.db).admin_connectivity_probe(
                provider_id=pk,
                model_override=probe_id,
                persist_registry_status=False,
            )
            if not probe.ok:
                detail = probe.detail if isinstance(probe.detail, str) else str(probe.detail or "")
                save_warnings.append(
                    f"{probe.message}{f' ({detail})' if detail.strip() else ''}"
                )

        return self._row_to_out(reg, save_warnings=save_warnings)

    async def _sync_default_flag_with_status(
        self,
        reg: LlmProviderRegistry,
        pk: str,
        save_warnings: list[str],
    ) -> None:
        """At most one ``is_default``; only ``connected`` rows may keep it."""
        status_norm = _norm_status(reg.status)

        if reg.is_default and status_norm != "connected":
            reg.is_default = False
            save_warnings.append(_DEFAULT_STALE_WARNING)
            await self.db.flush()

        if reg.is_default:
            await self.db.execute(
                update(LlmProviderRegistry)
                .where(LlmProviderRegistry.provider_id != pk)
                .values(is_default=False)
            )
            await self.db.flush()

    async def delete_provider(self, provider_id: str) -> None:
        await self.db.execute(
            delete(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == provider_id)
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
        providers = list(
            (await self.db.execute(select(LlmProviderRegistry))).scalars().all()
        )
        connected = [p for p in providers if _norm_status(p.status) == "connected"]
        if connected:
            for rule in body.rules:
                uc = (rule.use_case or "").strip().lower()
                exp_kind: LlmRegistryModelKind = "embedding" if uc == "embeddings" else "chat"
                for cand in (rule.primary_model, rule.fallback_model):
                    tid = (cand or "").strip() if cand else ""
                    if not tid:
                        continue
                    if not _registry_hosts_model_for_kind(connected, tid, exp_kind):
                        raise ApiError(
                            status_code=400,
                            code="ROUTING_MODEL_KIND_MISMATCH",
                            message=(
                                f"Routing rule {rule.use_case!r}: model {tid!r} is not deployed "
                                f"as {exp_kind} on any connected LLM provider."
                            ),
                        )
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
                provider_id=r.provider_id,
                enabled=r.enabled,
                selected_model=r.selected_model,
            )
            for r in rows
        ]

    async def put_studio_policy(
        self, studio_id: UUID, body: StudioLlmPolicyUpdate
    ) -> list[StudioLlmPolicyRowResponse]:
        for row in body.rows:
            sm = (row.selected_model or "").strip()
            if not sm:
                continue
            pr = await self.db.scalar(
                select(LlmProviderRegistry).where(
                    func.lower(LlmProviderRegistry.provider_id)
                    == (row.provider_id or "").strip().lower()
                )
            )
            if pr is None:
                raise ApiError(
                    status_code=400,
                    code="STUDIO_POLICY_UNKNOWN_PROVIDER",
                    message=f"Unknown LLM provider {row.provider_id!r}.",
                )
            if sm not in model_ids_for_kind(pr.models_json, "chat"):
                raise ApiError(
                    status_code=400,
                    code="STUDIO_POLICY_CHAT_MODEL_INVALID",
                    message=(
                        f"selected_model {sm!r} is not registered as a chat model on provider "
                        f"{row.provider_id!r}."
                    ),
                )
        await self.db.execute(
            delete(StudioLlmProviderPolicy).where(
                StudioLlmProviderPolicy.studio_id == studio_id
            )
        )
        for row in body.rows:
            self.db.add(
                StudioLlmProviderPolicy(
                    studio_id=studio_id,
                    provider_id=row.provider_id,
                    enabled=row.enabled,
                    selected_model=row.selected_model,
                )
            )
        await self.db.flush()
        return await self.get_studio_policy(studio_id)
