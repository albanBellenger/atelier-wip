"""FastAPI dependencies: database session, JWT user, RBAC."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ApiError
from app.models import CrossStudioAccess, Project, Software, Studio, StudioMember, User
from app.services.auth_service import AuthService


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> User:
    token = request.cookies.get("atelier_token")
    if not token:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Not authenticated",
        )
    return await AuthService(session).get_user_from_token(token)


async def require_tool_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_tool_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Tool admin access required",
        )
    return user


@dataclass(frozen=True)
class StudioAccess:
    """Resolved access for a studio-scoped route (owner studio id = software.studio_id in software routes)."""

    user: User
    studio_id: UUID
    membership: StudioMember | None
    cross_studio_grant: CrossStudioAccess | None = None

    @property
    def is_cross_studio_viewer(self) -> bool:
        return (
            self.cross_studio_grant is not None
            and self.cross_studio_grant.access_level == "viewer"
        )

    @property
    def is_cross_studio_external_editor(self) -> bool:
        return (
            self.cross_studio_grant is not None
            and self.cross_studio_grant.access_level == "external_editor"
        )

    @property
    def is_studio_admin(self) -> bool:
        if self.user.is_tool_admin:
            return True
        if self.cross_studio_grant is not None:
            return False
        return (
            self.membership is not None and self.membership.role == "studio_admin"
        )

    @property
    def is_studio_member(self) -> bool:
        if self.user.is_tool_admin:
            return True
        if self.cross_studio_grant is not None:
            return True
        return self.membership is not None

    @property
    def is_studio_editor(self) -> bool:
        """Edit specs/WO/artifacts/chat/thread for this software context."""
        if self.user.is_tool_admin:
            return True
        if self.is_cross_studio_external_editor:
            return True
        if self.membership is None:
            return False
        return self.membership.role in ("studio_admin", "studio_member")

    @property
    def can_publish(self) -> bool:
        if self.user.is_tool_admin:
            return True
        if self.cross_studio_grant is not None:
            return False
        return self.is_studio_editor

    @property
    def can_edit_software_definition(self) -> bool:
        """Software definition text — not cross-studio."""
        if self.user.is_tool_admin:
            return True
        if self.cross_studio_grant is not None:
            return False
        if self.membership is None:
            return False
        return self.membership.role in ("studio_admin", "studio_member")

    @property
    def can_create_project(self) -> bool:
        """Only members of the owning studio (not cross-studio grants)."""
        if self.user.is_tool_admin:
            return True
        if self.cross_studio_grant is not None:
            return False
        if self.membership is None:
            return False
        return self.membership.role in ("studio_admin", "studio_member")


async def resolve_studio_access(
    session: AsyncSession,
    user: User,
    studio_id: UUID,
) -> StudioAccess:
    studio = await session.get(Studio, studio_id)
    if studio is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Studio not found",
        )
    row = await session.execute(
        select(StudioMember).where(
            StudioMember.studio_id == studio_id,
            StudioMember.user_id == user.id,
        )
    )
    membership = row.scalar_one_or_none()
    if membership is None and not user.is_tool_admin:
        raise ApiError(
            status_code=403,
            code="NOT_STUDIO_MEMBER",
            message="Not a member of this studio",
        )
    return StudioAccess(
        user=user,
        studio_id=studio_id,
        membership=membership,
        cross_studio_grant=None,
    )


async def resolve_studio_access_for_software(
    session: AsyncSession,
    user: User,
    software: Software,
) -> StudioAccess:
    """Member of owning studio, tool admin, or approved cross-studio grant to this software."""
    studio_id = software.studio_id
    try:
        return await resolve_studio_access(session, user, studio_id)
    except ApiError as e:
        if e.error_code != "NOT_STUDIO_MEMBER":
            raise

    grants = (
        await session.execute(
            select(CrossStudioAccess).where(
                CrossStudioAccess.target_software_id == software.id,
                CrossStudioAccess.status == "approved",
            )
        )
    ).scalars().all()
    for grant in grants:
        m = (
            await session.execute(
                select(StudioMember).where(
                    StudioMember.studio_id == grant.requesting_studio_id,
                    StudioMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if m is not None:
            return StudioAccess(
                user=user,
                studio_id=studio_id,
                membership=None,
                cross_studio_grant=grant,
            )
    raise ApiError(
        status_code=403,
        code="NOT_STUDIO_MEMBER",
        message="Not a member of this studio",
    )


async def get_studio_access(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudioAccess:
    return await resolve_studio_access(session, user, studio_id)


@dataclass(frozen=True)
class SoftwareAccess:
    """Software row + studio membership for its studio."""

    studio_access: StudioAccess
    software: Software


@dataclass(frozen=True)
class ProjectAccess:
    """Project + parent software + studio membership."""

    studio_access: StudioAccess
    software: Software
    project: Project


async def get_software_access(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SoftwareAccess:
    software = await session.get(Software, software_id)
    if software is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Software not found",
        )
    studio_access = await resolve_studio_access_for_software(
        session, user, software
    )
    return SoftwareAccess(studio_access=studio_access, software=software)


async def get_software_in_studio(
    studio_id: UUID,
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SoftwareAccess:
    """GET/PATCH software under /studios/{studio_id}/software/{software_id}."""
    software = await session.get(Software, software_id)
    if software is None or software.studio_id != studio_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Software not found",
        )
    studio_access = await resolve_studio_access_for_software(
        session, user, software
    )
    return SoftwareAccess(studio_access=studio_access, software=software)


async def require_software_admin(
    sa: SoftwareAccess = Depends(get_software_access),
) -> SoftwareAccess:
    if not sa.studio_access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return sa


async def require_software_member(
    sa: SoftwareAccess = Depends(get_software_access),
) -> SoftwareAccess:
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required",
        )
    return sa


async def require_software_home_editor(
    sa: SoftwareAccess = Depends(get_software_access),
) -> SoftwareAccess:
    """Same as member/editor but excludes cross-studio grants (create project, etc.)."""
    if not sa.studio_access.can_create_project:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Owning studio membership required",
        )
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required",
        )
    return sa


async def require_software_editor_in_studio(
    studio_id: UUID,
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SoftwareAccess:
    sa = await get_software_in_studio(studio_id, software_id, session, user)
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio editor access required",
        )
    return sa


async def require_software_admin_in_studio(
    studio_id: UUID,
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SoftwareAccess:
    sa = await get_software_in_studio(studio_id, software_id, session, user)
    if not sa.studio_access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return sa


async def get_project_access_nested(
    software_id: UUID,
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectAccess:
    software = await session.get(Software, software_id)
    if software is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Software not found",
        )
    project = await session.get(Project, project_id)
    if project is None or project.software_id != software_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found",
        )
    studio_access = await resolve_studio_access_for_software(
        session, user, software
    )
    return ProjectAccess(
        studio_access=studio_access,
        software=software,
        project=project,
    )


async def fetch_project_access(
    session: AsyncSession,
    user: User,
    project_id: UUID,
) -> ProjectAccess:
    project = await session.get(Project, project_id)
    if project is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found",
        )
    software = await session.get(Software, project.software_id)
    if software is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found",
        )
    studio_access = await resolve_studio_access_for_software(
        session, user, software
    )
    return ProjectAccess(
        studio_access=studio_access,
        software=software,
        project=project,
    )


async def fetch_project_access_for_artifact_download(
    session: AsyncSession,
    user: User,
    project_id: UUID,
) -> ProjectAccess:
    """Same RBAC as normal project access (includes cross-studio viewer/editor)."""
    return await fetch_project_access(session, user, project_id)


async def get_project_access(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectAccess:
    return await fetch_project_access(session, user, project_id)


async def get_project_access_artifact_download(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectAccess:
    return await fetch_project_access_for_artifact_download(
        session, user, project_id
    )


async def require_project_member(
    pa: ProjectAccess = Depends(get_project_access),
) -> ProjectAccess:
    if not pa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required",
        )
    return pa


async def require_project_issues_readable(
    pa: ProjectAccess = Depends(get_project_access),
) -> ProjectAccess:
    if pa.studio_access.is_cross_studio_viewer:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Issues are not visible for cross-studio viewers",
        )
    return pa


async def require_can_publish(
    pa: ProjectAccess = Depends(require_project_member),
) -> ProjectAccess:
    if not pa.studio_access.can_publish:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Publish requires owning studio membership",
        )
    return pa


async def require_project_studio_admin(
    pa: ProjectAccess = Depends(get_project_access),
) -> ProjectAccess:
    if not pa.studio_access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return pa


async def require_project_studio_admin_nested(
    pa: ProjectAccess = Depends(get_project_access_nested),
) -> ProjectAccess:
    if not pa.studio_access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return pa


async def require_studio_admin(
    access: StudioAccess = Depends(get_studio_access),
) -> StudioAccess:
    if not access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return access


async def require_studio_editor(
    access: StudioAccess = Depends(get_studio_access),
) -> StudioAccess:
    if not access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio editor access required",
        )
    return access
