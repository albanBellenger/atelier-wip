"""Software product business logic."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import StudioAccess
from app.exceptions import ApiError
from app.integrations.gitlab_client import test_gitlab_connection
from app.models import Software
from app.schemas.software import (
    GitTestResult,
    SoftwareCreate,
    SoftwareResponse,
    SoftwareUpdate,
)
from app.security.field_encryption import decrypt_secret, encrypt_secret, fernet_configured


class SoftwareService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _to_response(self, s: Software) -> SoftwareResponse:
        return SoftwareResponse(
            id=s.id,
            studio_id=s.studio_id,
            name=s.name,
            description=s.description,
            definition=s.definition,
            git_provider=s.git_provider,
            git_repo_url=s.git_repo_url,
            git_branch=s.git_branch,
            git_token_set=bool(s.git_token),
            created_at=s.created_at,
            updated_at=s.updated_at,
        )

    async def list_software(self, access: StudioAccess) -> list[SoftwareResponse]:
        q = (
            select(
                Software.id,
                Software.studio_id,
                Software.name,
                Software.description,
                Software.definition,
                Software.git_provider,
                Software.git_repo_url,
                Software.git_branch,
                Software.git_token,
                Software.created_at,
                Software.updated_at,
            )
            .where(Software.studio_id == access.studio_id)
            .order_by(Software.name)
        )
        rows = (await self.db.execute(q)).all()
        return [
            SoftwareResponse(
                id=r.id,
                studio_id=r.studio_id,
                name=r.name,
                description=r.description,
                definition=r.definition,
                git_provider=r.git_provider,
                git_repo_url=r.git_repo_url,
                git_branch=r.git_branch,
                git_token_set=bool(r.git_token),
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]

    async def create_software(
        self, access: StudioAccess, body: SoftwareCreate
    ) -> SoftwareResponse:
        s = Software(
            id=uuid.uuid4(),
            studio_id=access.studio_id,
            name=body.name.strip(),
            description=body.description.strip() if body.description else None,
        )
        self.db.add(s)
        await self.db.commit()
        await self.db.refresh(s)
        return self._to_response(s)

    async def get_software(
        self, access: StudioAccess, software_id: uuid.UUID
    ) -> SoftwareResponse:
        s = await self._get_software_or_404(access.studio_id, software_id)
        return self._to_response(s)

    async def _get_software_or_404(
        self, studio_id: uuid.UUID, software_id: uuid.UUID
    ) -> Software:
        s = await self.db.get(Software, software_id)
        if s is None or s.studio_id != studio_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found",
            )
        return s

    async def update_software(
        self, access: StudioAccess, software_id: uuid.UUID, body: SoftwareUpdate
    ) -> SoftwareResponse:
        s = await self._get_software_or_404(access.studio_id, software_id)
        data = body.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is not None:
            s.name = str(data["name"]).strip()
        if "description" in data:
            s.description = (
                str(data["description"]).strip() if data["description"] else None
            )
        if "definition" in data:
            s.definition = data["definition"]
        if "git_repo_url" in data:
            s.git_repo_url = data["git_repo_url"]
        if "git_branch" in data and data["git_branch"] is not None:
            s.git_branch = str(data["git_branch"]).strip() or "main"
        if "git_token" in data:
            raw = data["git_token"]
            if raw is None or raw == "":
                s.git_token = None
            else:
                if not fernet_configured():
                    raise ApiError(
                        status_code=400,
                        code="ENCRYPTION_KEY_REQUIRED",
                        message="ENCRYPTION_KEY must be set to store a Git token",
                    )
                enc = encrypt_secret(str(raw))
                if enc is None:
                    raise ApiError(
                        status_code=500,
                        code="ENCRYPTION_FAILED",
                        message="Could not encrypt git token",
                    )
                s.git_token = enc
        await self.db.commit()
        await self.db.refresh(s)
        return self._to_response(s)

    async def delete_software(
        self, access: StudioAccess, software_id: uuid.UUID
    ) -> None:
        s = await self._get_software_or_404(access.studio_id, software_id)
        await self.db.delete(s)
        await self.db.commit()

    async def test_git(
        self, access: StudioAccess, software_id: uuid.UUID
    ) -> GitTestResult:
        s = await self._get_software_or_404(access.studio_id, software_id)
        if not s.git_repo_url or not s.git_repo_url.strip():
            return GitTestResult(ok=False, message="git_repo_url is not set")
        branch = (s.git_branch or "main").strip()
        token = decrypt_secret(s.git_token) if s.git_token else None
        if not token:
            return GitTestResult(
                ok=False, message="No git token stored; save a token first"
            )
        ok, msg = await test_gitlab_connection(
            s.git_repo_url, token, branch
        )
        return GitTestResult(ok=ok, message=msg)
