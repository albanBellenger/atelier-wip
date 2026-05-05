"""Tool-admin GitLab + budget fields on studios."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Software, Studio
from app.schemas.admin_console import StudioGitLabResponse, StudioGitLabUpdate, StudioToolAdminUpdate


class StudioToolAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_gitlab(self, studio: Studio) -> StudioGitLabResponse:
        return StudioGitLabResponse(
            git_provider=studio.git_provider,
            git_repo_url=studio.git_repo_url,
            git_branch=studio.git_branch,
            git_publish_strategy=studio.git_publish_strategy,
            git_token_set=bool((studio.git_token or "").strip()),
        )

    async def patch_gitlab(self, studio: Studio, body: StudioGitLabUpdate) -> StudioGitLabResponse:
        data = body.model_dump(exclude_unset=True)
        if "git_token" in data:
            studio.git_token = data.pop("git_token")
        for k, v in data.items():
            setattr(studio, k, v)
        await self.db.flush()
        await self._sync_software_git(studio.id)
        return await self.get_gitlab(studio)

    async def patch_budget(self, studio: Studio, body: StudioToolAdminUpdate) -> None:
        data = body.model_dump(exclude_unset=True, mode="python")
        if "budget_cap_monthly_usd" in data:
            studio.budget_cap_monthly_usd = data["budget_cap_monthly_usd"]
        if "budget_overage_action" in data:
            studio.budget_overage_action = str(data["budget_overage_action"])
        await self.db.flush()

    async def _sync_software_git(self, studio_id: UUID) -> None:
        st = await self.db.get(Studio, studio_id)
        if st is None:
            return
        await self.db.execute(
            update(Software)
            .where(Software.studio_id == studio_id)
            .values(
                git_provider=st.git_provider,
                git_repo_url=st.git_repo_url,
                git_token=st.git_token,
                git_branch=st.git_branch,
            )
        )
        await self.db.flush()
