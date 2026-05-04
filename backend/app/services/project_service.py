"""Project business logic."""

import uuid
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models import Project, Section, Software, WorkOrder
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    SectionSummary,
    StudioProjectListItemOut,
)
from app.security.field_encryption import decrypt_secret, fernet_configured
from app.services.git_service import (
    commit_moves,
    list_repo_blob_paths_under_prefix,
    moves_for_prefix_rename,
)
from app.services.publish_folder_slug import (
    coerce_publish_folder_slug_for_create,
    coerce_publish_folder_slug_for_update,
    next_unique_publish_folder_slug,
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
            publish_folder_slug=p.publish_folder_slug,
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

    async def _rename_publish_folder_in_remote_git_if_needed(
        self,
        software: Software | None,
        old_slug: str,
        new_slug: str,
    ) -> None:
        if software is None or old_slug == new_slug:
            return
        if (
            not (software.git_repo_url or "").strip()
            or not (software.git_branch or "").strip()
            or not software.git_token
        ):
            return
        if not fernet_configured():
            return
        plain = decrypt_secret(software.git_token)
        if not plain:
            return
        repo = software.git_repo_url.strip()
        branch = (software.git_branch or "main").strip()
        blobs = await list_repo_blob_paths_under_prefix(
            repo_web_url=repo,
            token=plain,
            branch=branch,
            path_prefix=old_slug,
        )
        if not blobs:
            return
        moves = moves_for_prefix_rename(old_slug, new_slug, blobs)
        if not moves:
            return
        await commit_moves(
            repo_web_url=repo,
            token=plain,
            branch=branch,
            moves=moves,
            message=f"Rename publish folder: {old_slug} → {new_slug}",
        )

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

    async def list_projects_for_studio(
        self, studio_id: uuid.UUID, *, include_archived: bool = False
    ) -> list[StudioProjectListItemOut]:
        q = (
            select(Project, Software.name)
            .join(Software, Project.software_id == Software.id)
            .where(Software.studio_id == studio_id)
        )
        if not include_archived:
            q = q.where(Project.archived.is_(False))
        q = q.order_by(Software.name, Project.name)
        pairs = (await self.db.execute(q)).all()
        ids = [p.id for p, _ in pairs]
        dash = await self._dashboard_for_project_ids(ids)
        out: list[StudioProjectListItemOut] = []
        for p, sw_name in pairs:
            base = self._to_response(
                p,
                work_orders_done=dash[p.id][0],
                work_orders_total=dash[p.id][1],
                sections_count=dash[p.id][2],
                last_edited_at=self._last_edited(p, dash[p.id][3]),
            )
            out.append(
                StudioProjectListItemOut(
                    **base.model_dump(),
                    software_name=str(sw_name),
                )
            )
        return out

    async def create_project(
        self,
        software_id: uuid.UUID,
        body: ProjectCreate,
        *,
        actor_user_id: uuid.UUID | None = None,
    ) -> ProjectResponse:
        base_slug = coerce_publish_folder_slug_for_create(
            body.publish_folder_slug, fallback_name=body.name.strip()
        )
        unique_slug = await next_unique_publish_folder_slug(self.db, software_id, base_slug)
        p = Project(
            id=uuid.uuid4(),
            software_id=software_id,
            name=body.name.strip(),
            description=body.description.strip() if body.description else None,
            publish_folder_slug=unique_slug,
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
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            if "uq_projects_software_publish_folder_slug" in str(getattr(exc, "orig", exc)):
                raise ApiError(
                    status_code=409,
                    code="PUBLISH_FOLDER_SLUG_TAKEN",
                    message="That publish folder slug is already used by another project in this software.",
                ) from exc
            raise
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
            issue_map = await SectionService(self.db).batch_open_issue_counts(
                p.id, [s.id for s in ordered]
            )
            section_summaries = [
                SectionSummary(
                    id=s.id,
                    title=s.title,
                    slug=s.slug,
                    order=s.order,
                    status=status_map[s.id],
                    open_issue_count=issue_map.get(s.id, 0),
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
        slug_change: tuple[str, str] | None = None
        if "publish_folder_slug" in data and data.get("publish_folder_slug") is not None:
            candidate = coerce_publish_folder_slug_for_update(
                str(data["publish_folder_slug"])
            )
            if candidate != p.publish_folder_slug:
                slug_change = (p.publish_folder_slug, candidate)
        if slug_change is not None:
            sw = await self.db.get(Software, software_id)
            await self._rename_publish_folder_in_remote_git_if_needed(
                sw, slug_change[0], slug_change[1]
            )
        if "name" in data and data["name"] is not None:
            p.name = str(data["name"]).strip()
        if "description" in data:
            d = data["description"]
            p.description = str(d).strip() if d else None
        if slug_change is not None:
            p.publish_folder_slug = slug_change[1]
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            if "uq_projects_software_publish_folder_slug" in str(getattr(exc, "orig", exc)):
                raise ApiError(
                    status_code=409,
                    code="PUBLISH_FOLDER_SLUG_TAKEN",
                    message="That publish folder slug is already used by another project in this software.",
                ) from exc
            raise
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
