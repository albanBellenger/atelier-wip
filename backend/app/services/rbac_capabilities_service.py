"""Map resolved ``StudioAccess`` to API capability flags (single source with ``deps.py``)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import StudioAccess
from app.exceptions import ApiError
from app.models import Software, Studio
from app.schemas.auth import CrossStudioGrantPublic
from app.schemas.studio_capabilities import StudioCapabilitiesOut


class RbacCapabilitiesService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def build_response(self, access: StudioAccess) -> StudioCapabilitiesOut:
        membership_role = (
            access.membership.role if access.membership is not None else None
        )
        grant_public: CrossStudioGrantPublic | None = None
        if access.cross_studio_grant is not None:
            g = access.cross_studio_grant
            sw = await self.db.get(Software, g.target_software_id)
            if sw is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Software not found",
                )
            st = await self.db.get(Studio, sw.studio_id)
            if st is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Studio not found",
                )
            grant_public = CrossStudioGrantPublic(
                grant_id=g.id,
                target_software_id=g.target_software_id,
                owner_studio_id=st.id,
                owner_studio_name=st.name,
                software_name=sw.name,
                access_level=g.access_level,
            )

        can_manage_project_outline = (
            access.cross_studio_grant is None and access.is_studio_admin
        )

        return StudioCapabilitiesOut(
            is_tool_admin=access.user.is_tool_admin,
            membership_role=membership_role,
            is_studio_admin=access.is_studio_admin,
            is_studio_editor=access.is_studio_editor,
            is_studio_member=access.is_studio_member,
            is_cross_studio_viewer=access.is_cross_studio_viewer,
            can_publish=access.can_publish,
            can_edit_software_definition=access.can_edit_software_definition,
            can_create_project=access.can_create_project,
            can_manage_project_outline=can_manage_project_outline,
            cross_studio_grant=grant_public,
        )
