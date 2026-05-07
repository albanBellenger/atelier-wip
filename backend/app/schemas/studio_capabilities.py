"""Effective RBAC capabilities for the current user (studio / optional software scope)."""

from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.auth import CrossStudioGrantPublic


class StudioCapabilitiesOut(BaseModel):
    """Mirrors ``StudioAccess`` in ``deps.py`` plus outline management (see ``require_outline_manager``)."""

    is_platform_admin: bool
    membership_role: str | None = Field(
        default=None,
        description="Home-studio wire role when enrolled (e.g. studio_admin); null for pure cross-studio.",
    )
    is_studio_admin: bool
    is_studio_editor: bool
    is_studio_member: bool
    is_cross_studio_viewer: bool
    can_publish: bool
    can_edit_software_definition: bool
    can_create_project: bool
    can_manage_project_outline: bool
    cross_studio_grant: CrossStudioGrantPublic | None = None
