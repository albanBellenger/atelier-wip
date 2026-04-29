"""Project business logic."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models import Project, Section
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    SectionSummary,
)


class ProjectService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _to_response(
        self,
        p: Project,
        *,
        sections: list[SectionSummary] | None = None,
    ) -> ProjectResponse:
        return ProjectResponse(
            id=p.id,
            software_id=p.software_id,
            name=p.name,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            sections=sections,
        )

    async def list_projects(self, software_id: uuid.UUID) -> list[ProjectResponse]:
        q = (
            select(Project)
            .where(Project.software_id == software_id)
            .order_by(Project.name)
        )
        rows = (await self.db.execute(q)).scalars().all()
        return [self._to_response(p) for p in rows]

    async def create_project(
        self, software_id: uuid.UUID, body: ProjectCreate
    ) -> ProjectResponse:
        p = Project(
            id=uuid.uuid4(),
            software_id=software_id,
            name=body.name.strip(),
            description=body.description.strip() if body.description else None,
        )
        self.db.add(p)
        await self.db.commit()
        await self.db.refresh(p)
        return self._to_response(p)

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
            section_summaries = [
                SectionSummary(
                    id=s.id,
                    title=s.title,
                    slug=s.slug,
                    order=s.order,
                )
                for s in ordered
            ]
        return self._to_response(p, sections=section_summaries)

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
        return self._to_response(p)

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
