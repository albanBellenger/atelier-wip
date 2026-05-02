"""Project business logic."""

import uuid
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models import Project, Section, Software, WorkOrder
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    SectionSummary,
)
from app.services.section_service import SectionService
from app.services.software_activity_service import SoftwareActivityService


class ProjectService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _to_response(
        self,
        p: Project,
        *,
        sections: list[SectionSummary] | None = None,
        work_orders_done: int = 0,
        work_orders_total: int = 0,
        sections_count: int = 0,
        last_edited_at: datetime | None = None,
    ) -> ProjectResponse:
        return ProjectResponse(
            id=p.id,
            software_id=p.software_id,
            name=p.name,
            description=p.description,
            archived=p.archived,
            created_at=p.created_at,
            updated_at=p.updated_at,
            sections=sections,
            work_orders_done=work_orders_done,
            work_orders_total=work_orders_total,
            sections_count=sections_count,
            last_edited_at=last_edited_at,
        )

    async def _dashboard_for_project_ids(
        self, project_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[int, int, int, datetime | None]]:
        """Per project: (work_orders_done, work_orders_total, sections_count, max_section_updated_at)."""
        if not project_ids:
            return {}
        wo_stmt = (
            select(
                WorkOrder.project_id,
                func.count().label("total"),
                func.coalesce(
                    func.sum(case((WorkOrder.status == "done", 1), else_=0)),
                    0,
                ).label("done"),
            )
            .where(WorkOrder.project_id.in_(project_ids))
            .group_by(WorkOrder.project_id)
        )
        sec_stmt = (
            select(
                Section.project_id,
                func.count().label("cnt"),
                func.max(Section.updated_at).label("mx"),
            )
            .where(Section.project_id.in_(project_ids))
            .group_by(Section.project_id)
        )
        wo_rows = (await self.db.execute(wo_stmt)).all()
        sec_rows = (await self.db.execute(sec_stmt)).all()
        out: dict[uuid.UUID, tuple[int, int, int, datetime | None]] = {
            pid: (0, 0, 0, None) for pid in project_ids
        }
        for row in wo_rows:
            pid = row.project_id
            total = int(row.total or 0)
            done = int(row.done or 0)
            _, _, sc, mx = out[pid]
            out[pid] = (done, total, sc, mx)
        for row in sec_rows:
            pid = row.project_id
            wo_done, wo_total, _, _ = out[pid]
            cnt = int(row.cnt or 0)
            mx = row.mx
            out[pid] = (wo_done, wo_total, cnt, mx)
        return out

    def _last_edited(
        self,
        p: Project,
        sections_max_updated: datetime | None,
    ) -> datetime:
        candidates = [p.updated_at]
        if sections_max_updated is not None:
            candidates.append(sections_max_updated)
        return max(candidates)

    async def list_projects(
        self, software_id: uuid.UUID, *, include_archived: bool = False
    ) -> list[ProjectResponse]:
        q = select(Project).where(Project.software_id == software_id)
        if not include_archived:
            q = q.where(Project.archived.is_(False))
        q = q.order_by(Project.name)
        rows = (await self.db.execute(q)).scalars().all()
        ids = [p.id for p in rows]
        dash = await self._dashboard_for_project_ids(ids)
        return [
            self._to_response(
                p,
                work_orders_done=dash[p.id][0],
                work_orders_total=dash[p.id][1],
                sections_count=dash[p.id][2],
                last_edited_at=self._last_edited(p, dash[p.id][3]),
            )
            for p in rows
        ]

    async def create_project(
        self,
        software_id: uuid.UUID,
        body: ProjectCreate,
        *,
        actor_user_id: uuid.UUID | None = None,
    ) -> ProjectResponse:
        p = Project(
            id=uuid.uuid4(),
            software_id=software_id,
            name=body.name.strip(),
            description=body.description.strip() if body.description else None,
        )
        self.db.add(p)
        await self.db.flush()
        await self.db.refresh(p)
        sw = await self.db.get(Software, software_id)
        if sw is not None:
            await SoftwareActivityService(self.db).record(
                software_id=software_id,
                studio_id=sw.studio_id,
                actor_user_id=actor_user_id,
                verb="project_created",
                summary=f"Created project {p.name}",
                entity_type="project",
                entity_id=p.id,
            )
        await self.db.commit()
        await self.db.refresh(p)
        dash = await self._dashboard_for_project_ids([p.id])
        d = dash[p.id]
        return self._to_response(
            p,
            work_orders_done=d[0],
            work_orders_total=d[1],
            sections_count=d[2],
            last_edited_at=self._last_edited(p, d[3]),
        )

    async def get_project(
        self,
        software_id: uuid.UUID,
        project_id: uuid.UUID,
        *,
        include_sections: bool = False,
    ) -> ProjectResponse:
        if include_sections:
            q = (
                select(Project)
                .where(
                    Project.id == project_id,
                    Project.software_id == software_id,
                )
                .options(selectinload(Project.sections))
            )
            p = (await self.db.execute(q)).scalar_one_or_none()
        else:
            p = await self.db.get(Project, project_id)
            if p is not None and p.software_id != software_id:
                p = None
        if p is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found",
            )
        section_summaries: list[SectionSummary] | None = None
        if include_sections and p.sections is not None:
            ordered = sorted(p.sections, key=lambda s: s.order)
            status_map = await SectionService(self.db).batch_section_statuses(
                p.id, ordered
            )
            section_summaries = [
                SectionSummary(
                    id=s.id,
                    title=s.title,
                    slug=s.slug,
                    order=s.order,
                    status=status_map[s.id],
                    updated_at=s.updated_at,
                )
                for s in ordered
            ]
        dash = await self._dashboard_for_project_ids([p.id])
        d = dash[p.id]
        sec_mx = d[3]
        sec_cnt = d[2]
        if section_summaries is not None:
            sec_cnt = len(section_summaries)
            if section_summaries:
                sec_mx = max(s.updated_at for s in section_summaries)
        return self._to_response(
            p,
            sections=section_summaries,
            work_orders_done=d[0],
            work_orders_total=d[1],
            sections_count=sec_cnt,
            last_edited_at=self._last_edited(p, sec_mx),
        )

    async def update_project(
        self,
        software_id: uuid.UUID,
        project_id: uuid.UUID,
        body: ProjectUpdate,
    ) -> ProjectResponse:
        p = await self.db.get(Project, project_id)
        if p is None or p.software_id != software_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found",
            )
        data = body.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is not None:
            p.name = str(data["name"]).strip()
        if "description" in data:
            d = data["description"]
            p.description = str(d).strip() if d else None
        await self.db.commit()
        await self.db.refresh(p)
        dash = await self._dashboard_for_project_ids([p.id])
        d = dash[p.id]
        return self._to_response(
            p,
            work_orders_done=d[0],
            work_orders_total=d[1],
            sections_count=d[2],
            last_edited_at=self._last_edited(p, d[3]),
        )

    async def patch_project_archived(
        self,
        software_id: uuid.UUID,
        project_id: uuid.UUID,
        *,
        archived: bool,
        actor_user_id: uuid.UUID | None,
    ) -> ProjectResponse:
        p = await self.db.get(Project, project_id)
        if p is None or p.software_id != software_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found",
            )
        p.archived = archived
        await self.db.flush()
        sw = await self.db.get(Software, software_id)
        if sw is not None:
            await SoftwareActivityService(self.db).record(
                software_id=software_id,
                studio_id=sw.studio_id,
                actor_user_id=actor_user_id,
                verb="project_archived" if archived else "project_unarchived",
                summary=(
                    f"Archived project {p.name}"
                    if archived
                    else f"Restored project {p.name}"
                ),
                entity_type="project",
                entity_id=p.id,
            )
        await self.db.commit()
        await self.db.refresh(p)
        dash = await self._dashboard_for_project_ids([p.id])
        d = dash[p.id]
        return self._to_response(
            p,
            work_orders_done=d[0],
            work_orders_total=d[1],
            sections_count=d[2],
            last_edited_at=self._last_edited(p, d[3]),
        )

    async def delete_project(self, software_id: uuid.UUID, project_id: uuid.UUID) -> None:
        p = await self.db.get(Project, project_id)
        if p is None or p.software_id != software_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found",
            )
        await self.db.delete(p)
        await self.db.commit()
