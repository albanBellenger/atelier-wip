"""Persist artifact exclusions at software and project scope."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import (
    Artifact,
    Project,
    ProjectArtifactExclusion,
    Software,
    SoftwareArtifactExclusion,
)


class ArtifactExclusionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _artifact_under_software(self, software_id: UUID, artifact_id: UUID) -> Artifact:
        r = await self.db.execute(
            select(Artifact)
            .join(Project, Artifact.project_id == Project.id)
            .where(
                Artifact.id == artifact_id,
                Project.software_id == software_id,
                Artifact.scope_level == "project",
            )
        )
        art = r.scalar_one_or_none()
        if art is not None:
            return art
        r2 = await self.db.execute(
            select(Artifact).where(
                Artifact.id == artifact_id,
                Artifact.scope_level == "software",
                Artifact.library_software_id == software_id,
            )
        )
        art2 = r2.scalar_one_or_none()
        if art2 is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found for this software.",
            )
        return art2

    async def set_software_exclusion(
        self,
        *,
        studio_id: UUID,
        software_id: UUID,
        artifact_id: UUID,
        excluded: bool,
        user_id: UUID,
    ) -> bool:
        sw = await self.db.get(Software, software_id)
        if sw is None or sw.studio_id != studio_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        await self._artifact_under_software(software_id, artifact_id)

        r = await self.db.execute(
            select(SoftwareArtifactExclusion).where(
                SoftwareArtifactExclusion.software_id == software_id,
                SoftwareArtifactExclusion.artifact_id == artifact_id,
            )
        )
        row = r.scalar_one_or_none()
        if excluded:
            if row is None:
                self.db.add(
                    SoftwareArtifactExclusion(
                        software_id=software_id,
                        artifact_id=artifact_id,
                        created_by=user_id,
                    )
                )
                await self.db.flush()
            return True
        if row is not None:
            await self.db.delete(row)
            await self.db.flush()
        return False

    async def set_project_exclusion(
        self,
        *,
        studio_id: UUID,
        software_id: UUID,
        project_id: UUID,
        artifact_id: UUID,
        excluded: bool,
        user_id: UUID,
    ) -> bool:
        sw = await self.db.get(Software, software_id)
        if sw is None or sw.studio_id != studio_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        proj = await self.db.get(Project, project_id)
        if proj is None or proj.software_id != software_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        await self._artifact_under_software(software_id, artifact_id)

        r = await self.db.execute(
            select(ProjectArtifactExclusion).where(
                ProjectArtifactExclusion.project_id == project_id,
                ProjectArtifactExclusion.artifact_id == artifact_id,
            )
        )
        row = r.scalar_one_or_none()
        if excluded:
            if row is None:
                self.db.add(
                    ProjectArtifactExclusion(
                        project_id=project_id,
                        artifact_id=artifact_id,
                        created_by=user_id,
                    )
                )
                await self.db.flush()
            return True
        if row is not None:
            await self.db.delete(row)
            await self.db.flush()
        return False
