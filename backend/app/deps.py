"""FastAPI dependencies: database session, JWT user, RBAC."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ApiError
from app.models import (
    Artifact,
    CrossStudioAccess,
    Project,
    Software,
    Studio,
    StudioMember,
    User,
)
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


async def get_studio_for_tool_admin(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> Studio:
    st = await session.get(Studio, studio_id)
    if st is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Studio not found",
        )
    return st


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


@dataclass(frozen=True)
class StudioSoftwareListAccess:
    """Listing software under GET /studios/{id}/software (members or cross-studio grantees)."""

    studio_access: StudioAccess
    allowed_software_ids: frozenset[UUID] | None


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

    result = await session.execute(
        select(CrossStudioAccess)
        .join(
            StudioMember,
            and_(
                StudioMember.studio_id == CrossStudioAccess.requesting_studio_id,
                StudioMember.user_id == user.id,
            ),
        )
        .where(
            CrossStudioAccess.target_software_id == software.id,
            CrossStudioAccess.status == "approved",
        )
        .limit(1)
    )
    grant = result.scalar_one_or_none()
    if grant is not None:
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


async def get_studio_software_list_access(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudioSoftwareListAccess:
    """Allow studio members, tool admins, or cross-studio grantees (filtered software only)."""
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
    if membership is not None or user.is_tool_admin:
        access = await resolve_studio_access(session, user, studio_id)
        return StudioSoftwareListAccess(
            studio_access=access,
            allowed_software_ids=None,
        )

    id_result = await session.execute(
        select(Software.id)
        .join(
            CrossStudioAccess,
            CrossStudioAccess.target_software_id == Software.id,
        )
        .join(
            StudioMember,
            and_(
                StudioMember.studio_id == CrossStudioAccess.requesting_studio_id,
                StudioMember.user_id == user.id,
            ),
        )
        .where(
            Software.studio_id == studio_id,
            CrossStudioAccess.status == "approved",
        )
        .distinct()
    )
    allowed_ids = frozenset(id_result.scalars().all())
    if not allowed_ids:
        raise ApiError(
            status_code=403,
            code="NOT_STUDIO_MEMBER",
            message="Not a member of this studio",
        )
    grant = (
        await session.execute(
            select(CrossStudioAccess)
            .join(
                StudioMember,
                and_(
                    StudioMember.studio_id == CrossStudioAccess.requesting_studio_id,
                    StudioMember.user_id == user.id,
                ),
            )
            .where(
                CrossStudioAccess.target_software_id.in_(allowed_ids),
                CrossStudioAccess.status == "approved",
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if grant is None:
        raise ApiError(
            status_code=403,
            code="NOT_STUDIO_MEMBER",
            message="Not a member of this studio",
        )
    access = StudioAccess(
        user=user,
        studio_id=studio_id,
        membership=None,
        cross_studio_grant=grant,
    )
    return StudioSoftwareListAccess(
        studio_access=access,
        allowed_software_ids=allowed_ids,
    )


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


async def fetch_software_access(
    session: AsyncSession,
    user: User,
    software_id: UUID,
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


async def fetch_project_access_for_artifact_download(
    session: AsyncSession,
    user: User,
    project_id: UUID,
) -> ProjectAccess:
    """Same RBAC as normal project access (includes cross-studio viewer/editor)."""
    return await fetch_project_access(session, user, project_id)


async def ensure_user_can_download_artifact(
    session: AsyncSession,
    user: User,
    artifact: Artifact,
) -> None:
    """Authorize artifact download for project-, studio-, or software-scoped rows."""
    scope = artifact.scope_level or "project"
    if scope == "project":
        if artifact.project_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        await fetch_project_access_for_artifact_download(
            session, user, artifact.project_id
        )
        return
    if scope == "studio":
        if artifact.library_studio_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        st = await session.get(Studio, artifact.library_studio_id)
        if st is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Studio not found.",
            )
        row = await session.execute(
            select(StudioMember).where(
                StudioMember.studio_id == artifact.library_studio_id,
                StudioMember.user_id == user.id,
            )
        )
        mem = row.scalar_one_or_none()
        if mem is None and not user.is_tool_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Not a member of this studio",
            )
        return
    if scope == "software":
        if artifact.library_software_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        sw = await session.get(Software, artifact.library_software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        await resolve_studio_access_for_software(session, user, sw)
        return
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message="Artifact not found.",
    )


async def ensure_user_can_delete_artifact(
    session: AsyncSession,
    user: User,
    artifact: Artifact,
) -> None:
    """Studio admin (owning studio) or tool admin may delete or configure any artifact scope."""
    if user.is_tool_admin:
        return
    scope = artifact.scope_level or "project"
    if scope == "project":
        if artifact.project_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        pa = await fetch_project_access(session, user, artifact.project_id)
        if not pa.studio_access.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio admin access required",
            )
        return
    if scope == "studio":
        if artifact.library_studio_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        sa = await resolve_studio_access(session, user, artifact.library_studio_id)
        if not sa.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio admin access required",
            )
        return
    if scope == "software":
        if artifact.library_software_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        sw = await session.get(Software, artifact.library_software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        sa = await resolve_studio_access_for_software(session, user, sw)
        if not sa.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio admin access required",
            )
        return
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message="Artifact not found.",
    )


async def ensure_user_can_reindex_artifact(
    session: AsyncSession,
    user: User,
    artifact: Artifact,
) -> None:
    """Studio editor on owning studio (or tool admin); viewers cannot re-index."""
    if user.is_tool_admin:
        return
    scope = artifact.scope_level or "project"
    if scope == "project":
        if artifact.project_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        pa = await fetch_project_access(session, user, artifact.project_id)
        if not pa.studio_access.is_studio_editor:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio editor access required",
            )
        return
    if scope == "studio":
        if artifact.library_studio_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        sa = await resolve_studio_access(session, user, artifact.library_studio_id)
        if not sa.is_studio_editor:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio editor access required",
            )
        return
    if scope == "software":
        if artifact.library_software_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        sw = await session.get(Software, artifact.library_software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        sa = await resolve_studio_access_for_software(session, user, sw)
        if not sa.is_studio_editor:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio editor access required",
            )
        return
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message="Artifact not found.",
    )


async def user_can_view_artifact_chunk_previews(
    session: AsyncSession,
    user: User,
    artifact: Artifact,
) -> bool:
    """Editors (home studio or cross-studio external_editor) may see chunk text; viewers may not."""
    scope = artifact.scope_level or "project"
    if scope == "project":
        if artifact.project_id is None:
            return False
        pa = await fetch_project_access(session, user, artifact.project_id)
        return pa.studio_access.is_studio_editor
    if scope == "studio":
        if artifact.library_studio_id is None:
            return False
        sa = await resolve_studio_access(session, user, artifact.library_studio_id)
        return sa.is_studio_editor
    if scope == "software":
        if artifact.library_software_id is None:
            return False
        sw = await session.get(Software, artifact.library_software_id)
        if sw is None:
            return False
        sa = await resolve_studio_access_for_software(session, user, sw)
        return sa.is_studio_editor
    return False


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


async def require_outline_manager(
    pa: ProjectAccess = Depends(get_project_access),
) -> ProjectAccess:
    if pa.studio_access.cross_studio_grant is not None:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Cross-studio access cannot manage the project outline.",
        )
    if not pa.studio_access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return pa


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


async def require_project_home_editor_nested(
    pa: ProjectAccess = Depends(get_project_access_nested),
) -> ProjectAccess:
    """Owning studio editor/member (excludes cross-studio grants)."""
    if not pa.studio_access.can_create_project:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Owning studio membership required",
        )
    if not pa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required",
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
