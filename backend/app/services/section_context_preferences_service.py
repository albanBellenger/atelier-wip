"""Persisted JSON preferences for section RAG context."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import SectionContextPreference
from app.models.project import Section
from app.schemas.section_context_preferences import (
    SectionContextPrefsOut,
    SectionContextPrefsPatch,
)


def _payload_to_out(raw: dict[str, Any]) -> SectionContextPrefsOut:
    ex = raw.get("excluded_kinds")
    if not isinstance(ex, list):
        ex = []
    kinds = [str(x) for x in ex if isinstance(x, str)]

    def _uuid_list(key: str) -> list[uuid.UUID]:
        v = raw.get(key)
        if not isinstance(v, list):
            return []
        out: list[uuid.UUID] = []
        for x in v:
            try:
                if isinstance(x, str):
                    out.append(uuid.UUID(x))
                elif isinstance(x, uuid.UUID):
                    out.append(x)
            except ValueError:
                continue
        return out

    urls = raw.get("extra_urls")
    if not isinstance(urls, list):
        urls = []
    clean_urls: list[dict[str, Any]] = []
    for u in urls:
        if isinstance(u, dict) and isinstance(u.get("url"), str):
            clean_urls.append(
                {"url": str(u["url"]).strip()[:2048], "note": str(u.get("note") or "")[:512]}
            )

    return SectionContextPrefsOut(
        excluded_kinds=kinds,
        pinned_artifact_ids=_uuid_list("pinned_artifact_ids"),
        pinned_section_ids=_uuid_list("pinned_section_ids"),
        pinned_work_order_ids=_uuid_list("pinned_work_order_ids"),
        extra_urls=clean_urls,
    )


def _merge_payload(prev: dict[str, Any], patch: SectionContextPrefsPatch) -> dict[str, Any]:
    out = dict(prev)
    data = patch.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is None:
            continue
        if k == "extra_urls" and isinstance(v, list):
            out[k] = v
        elif k in (
            "pinned_artifact_ids",
            "pinned_section_ids",
            "pinned_work_order_ids",
        ) and isinstance(v, list):
            out[k] = [str(x) for x in v]
        elif isinstance(v, list):
            out[k] = list(v)
        else:
            out[k] = v
    return out


class SectionContextPreferencesService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_for_user_section(
        self, user_id: uuid.UUID, section_id: uuid.UUID
    ) -> SectionContextPrefsOut:
        r = await self.db.execute(
            select(SectionContextPreference).where(
                SectionContextPreference.user_id == user_id,
                SectionContextPreference.section_id == section_id,
            )
        )
        row = r.scalar_one_or_none()
        if row is None:
            return SectionContextPrefsOut()
        raw = row.payload if isinstance(row.payload, dict) else {}
        return _payload_to_out(raw)

    async def patch_for_user_section(
        self,
        user_id: uuid.UUID,
        section_id: uuid.UUID,
        body: SectionContextPrefsPatch,
    ) -> SectionContextPrefsOut:
        sec = await self.db.get(Section, section_id)
        if sec is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Section not found")
        r = await self.db.execute(
            select(SectionContextPreference).where(
                SectionContextPreference.user_id == user_id,
                SectionContextPreference.section_id == section_id,
            )
        )
        row = r.scalar_one_or_none()
        prev: dict[str, Any] = {}
        if row is not None and isinstance(row.payload, dict):
            prev = dict(row.payload)
        merged = _merge_payload(prev, body)
        if row is None:
            row = SectionContextPreference(
                id=uuid.uuid4(),
                user_id=user_id,
                section_id=section_id,
                payload=merged,
            )
            self.db.add(row)
        else:
            row.payload = merged
        await self.db.commit()
        await self.db.refresh(row)
        return _payload_to_out(row.payload if isinstance(row.payload, dict) else {})
