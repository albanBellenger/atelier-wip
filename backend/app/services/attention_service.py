"""Merge issues, stale work orders, and peer edits for the Needs attention widget."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Issue, Project, Section, Software, User, WorkOrder
from app.models.work_order import WorkOrderSection
from app.schemas.attention import (
    AttentionCountsOut,
    AttentionItemOut,
    AttentionLinksOut,
    AttentionKind,
    AttentionListOut,
    SoftwareAttentionItemOut,
    SoftwareAttentionListOut,
)

_ATTENTION_MAX_ITEMS = 50
_UPDATE_LOOKBACK_DAYS = 14


def _slug_file(slug: str) -> str:
    s = (slug or "").strip() or "section"
    return f"{s}.md"


class AttentionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_project_attention(
        self,
        *,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        is_studio_admin: bool,
    ) -> AttentionListOut:
        proj = await self.db.get(Project, project_id)
        if proj is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        sw = await self.db.get(Software, proj.software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        studio_id = sw.studio_id
        software_id = sw.id

        sec_rows = (
            await self.db.execute(select(Section).where(Section.project_id == project_id))
        ).scalars().all()
        section_by_id: dict[uuid.UUID, Section] = {s.id: s for s in sec_rows}

        doc_sec_rows = (
            await self.db.execute(
                select(Section).where(
                    Section.software_id == software_id,
                    Section.project_id.is_(None),
                )
            )
        ).scalars().all()
        for s in doc_sec_rows:
            section_by_id[s.id] = s

        issue_stmt = select(Issue).where(
            Issue.status == "open",
            or_(
                Issue.project_id == project_id,
                and_(
                    Issue.software_id == software_id,
                    or_(Issue.project_id.is_(None), Issue.project_id == project_id),
                ),
            ),
        )
        if not is_studio_admin:
            issue_stmt = issue_stmt.where(
                or_(
                    Issue.run_actor_id == user_id,
                    Issue.triggered_by == user_id,
                )
            )
        issue_stmt = issue_stmt.order_by(Issue.created_at.desc())
        issues = list((await self.db.execute(issue_stmt)).scalars().all())

        actor_ids: set[uuid.UUID] = set()
        for iss in issues:
            if iss.run_actor_id is not None:
                actor_ids.add(iss.run_actor_id)
            if iss.triggered_by is not None:
                actor_ids.add(iss.triggered_by)

        stale_wos = list(
            (
                await self.db.execute(
                    select(WorkOrder).where(
                        WorkOrder.project_id == project_id,
                        WorkOrder.is_stale.is_(True),
                    )
                )
            ).scalars().all()
        )

        update_cutoff = datetime.now(timezone.utc) - timedelta(days=_UPDATE_LOOKBACK_DAYS)
        update_candidates = list(
            (
                await self.db.execute(
                    select(WorkOrder).where(
                        WorkOrder.project_id == project_id,
                        WorkOrder.is_stale.is_(False),
                        WorkOrder.updated_by_id.isnot(None),
                        WorkOrder.updated_by_id != user_id,
                        WorkOrder.updated_at >= update_cutoff,
                    )
                )
            ).scalars().all()
        )
        update_wos = list(update_candidates)

        for wo in stale_wos + update_wos:
            if wo.updated_by_id is not None:
                actor_ids.add(wo.updated_by_id)

        names = await self._display_names(actor_ids)

        items_raw: list[tuple[AttentionKind, datetime, AttentionItemOut]] = []

        for iss in issues:
            if iss.kind in ("code_drift_section", "code_drift_work_order"):
                att_kind: AttentionKind = "drift"
            elif iss.kind == "conflict_or_gap":
                att_kind = "conflict" if iss.section_b_id is not None else "gap"
            else:
                att_kind = "update"
            sec_a = (
                section_by_id.get(iss.section_a_id)
                if iss.section_a_id is not None
                else None
            )
            title = _slug_file(sec_a.slug) if sec_a else "Issue"
            if att_kind == "conflict" and iss.section_b_id is not None:
                sec_b = section_by_id.get(iss.section_b_id)
                if sec_a is not None and sec_b is not None:
                    title = f"{_slug_file(sec_a.slug)} ↔ {_slug_file(sec_b.slug)}"
            elif att_kind == "drift" and iss.kind == "code_drift_work_order":
                short = str(iss.work_order_id or "").replace("-", "")[:6].upper()
                title = f"WO-{short} · code drift" if iss.work_order_id else "Work order code drift"
            elif att_kind == "drift" and iss.kind == "code_drift_section" and sec_a is not None:
                title = f"Docs · {_slug_file(sec_a.slug)}"

            if iss.origin == "auto":
                subtitle = "Auto-detected on publish"
            else:
                uid = iss.run_actor_id or iss.triggered_by
                disp = names.get(uid, "Unknown") if uid else "Unknown"
                subtitle = f"Manual analysis · {disp}"

            wo_link = iss.work_order_id if iss.kind == "code_drift_work_order" else None
            sec_link = None if iss.kind == "code_drift_work_order" else iss.section_a_id

            items_raw.append(
                (
                    att_kind,
                    iss.created_at,
                    AttentionItemOut(
                        id=f"issue:{iss.id}",
                        kind=att_kind,
                        title=title,
                        subtitle=subtitle,
                        description=iss.description,
                        occurred_at=iss.created_at,
                        links=AttentionLinksOut(
                            issue_id=iss.id,
                            section_id=sec_link,
                            work_order_id=wo_link,
                        ),
                    ),
                )
            )

        for wo in stale_wos:
            short = str(wo.id).replace("-", "")[:6].upper()
            subtitle = "Drift detector"
            desc = (wo.stale_reason or "").strip() or (
                "Linked spec section changed substantially after this Work Order was generated."
            )
            items_raw.append(
                (
                    "drift",
                    wo.updated_at,
                    AttentionItemOut(
                        id=f"wo:{wo.id}",
                        kind="drift",
                        title=f"WO-{short} · {wo.title}",
                        subtitle=subtitle,
                        description=desc[:8000],
                        occurred_at=wo.updated_at,
                        links=AttentionLinksOut(work_order_id=wo.id),
                    ),
                )
            )

        woids_for_sections = [w.id for w in update_wos]
        sec_map: dict[uuid.UUID, list[uuid.UUID]] = {}
        if woids_for_sections:
            wr = await self.db.execute(
                select(WorkOrderSection.work_order_id, WorkOrderSection.section_id).where(
                    WorkOrderSection.work_order_id.in_(woids_for_sections)
                )
            )
            for wid, sid in wr.all():
                sec_map.setdefault(wid, []).append(sid)

        for wo in update_wos:
            editor = names.get(wo.updated_by_id, "Someone") if wo.updated_by_id else "Someone"
            sids = sec_map.get(wo.id, [])
            first_slug = None
            for sid in sids:
                s = section_by_id.get(sid)
                if s:
                    first_slug = s.slug
                    break
            title = _slug_file(first_slug) if first_slug else wo.title
            short = str(wo.id).replace("-", "")[:6].upper()
            items_raw.append(
                (
                    "update",
                    wo.updated_at,
                    AttentionItemOut(
                        id=f"wo-upd:{wo.id}",
                        kind="update",
                        title=title,
                        subtitle=editor,
                        description=f"Last edited by {editor}. Open WO-{short} for details.",
                        occurred_at=wo.updated_at,
                        links=AttentionLinksOut(
                            work_order_id=wo.id,
                            section_id=sids[0] if sids else None,
                        ),
                    ),
                )
            )

        items_raw.sort(key=lambda x: x[1], reverse=True)
        trimmed = items_raw[:_ATTENTION_MAX_ITEMS]

        def count_kind(k: AttentionKind) -> int:
            return sum(1 for t, _, __ in items_raw if t == k)

        counts = AttentionCountsOut(
            all=len(items_raw),
            conflict=count_kind("conflict"),
            drift=count_kind("drift"),
            gap=count_kind("gap"),
            update=count_kind("update"),
        )

        return AttentionListOut(
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            counts=counts,
            items=[x[2] for x in trimmed],
        )

    async def list_software_attention(
        self,
        *,
        software_id: uuid.UUID,
        user_id: uuid.UUID,
        is_studio_admin: bool,
    ) -> SoftwareAttentionListOut:
        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        studio_id = sw.studio_id
        projects = list(
            (
                await self.db.execute(
                    select(Project).where(Project.software_id == software_id)
                )
            ).scalars().all()
        )
        merged: list[SoftwareAttentionItemOut] = []
        for p in projects:
            sub = await self.list_project_attention(
                project_id=p.id,
                user_id=user_id,
                is_studio_admin=is_studio_admin,
            )
            for it in sub.items:
                merged.append(
                    SoftwareAttentionItemOut(
                        project_id=p.id,
                        project_name=p.name,
                        item=it,
                    )
                )
        merged.sort(key=lambda w: w.item.occurred_at, reverse=True)

        def count_kind(k: AttentionKind) -> int:
            return sum(1 for w in merged if w.item.kind == k)

        counts = AttentionCountsOut(
            all=len(merged),
            conflict=count_kind("conflict"),
            drift=count_kind("drift"),
            gap=count_kind("gap"),
            update=count_kind("update"),
        )
        trimmed = merged[:_ATTENTION_MAX_ITEMS]
        return SoftwareAttentionListOut(
            studio_id=studio_id,
            software_id=software_id,
            counts=counts,
            items=trimmed,
        )

    async def _display_names(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        r = await self.db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))
        return {row[0]: row[1] for row in r.all()}
