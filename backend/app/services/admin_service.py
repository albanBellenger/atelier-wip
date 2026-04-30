"""Tool admin configuration for LLM and embedding providers."""

from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig, User
from app.schemas.auth import (
    AdminConfigResponse,
    AdminConfigUpdate,
    AdminConnectivityResult,
    UserPublic,
)
from app.services.embedding_service import EmbeddingService
from app.openai_compat_urls import chat_completions_url


def _mask(s: str | None) -> bool:
    return bool(s and s.strip())


class AdminService:
    """CRUD for singleton `admin_config` row (id=1)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create(self) -> AdminConfig:
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_public(self) -> AdminConfigResponse:
        row = await self.get_or_create()
        return AdminConfigResponse(
            llm_provider=row.llm_provider,
            llm_model=row.llm_model,
            llm_api_base_url=row.llm_api_base_url,
            llm_api_key_set=_mask(row.llm_api_key),
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_api_base_url=row.embedding_api_base_url,
            embedding_api_key_set=_mask(row.embedding_api_key),
        )

    async def update(self, body: AdminConfigUpdate) -> AdminConfigResponse:
        row = await self.get_or_create()
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(row, key, value)
        await self.db.flush()
        return await self.get_public()

    async def set_admin_status(
        self,
        target_user_id: UUID,
        is_tool_admin: bool,
        requesting_user: User,
    ) -> UserPublic:
        if target_user_id == requesting_user.id and is_tool_admin is False:
            raise ApiError(
                status_code=400,
                code="SELF_REVOCATION_BLOCKED",
                message="A Tool Admin cannot revoke their own admin status.",
            )
        target_user = await self.db.get(User, target_user_id)
        if target_user is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="User not found.",
            )
        target_user.is_tool_admin = is_tool_admin
        self.db.add(target_user)
        await self.db.flush()
        return UserPublic.model_validate(target_user)

    async def test_llm(self) -> AdminConnectivityResult:
        """Minimal chat completion against stored LLM config (OpenAI-compatible)."""
        row = await self.get_or_create()
        model = (row.llm_model or "").strip()
        key = (row.llm_api_key or "").strip()
        prov = (row.llm_provider or "").strip().lower()
        if not model or not key:
            return AdminConnectivityResult(
                ok=False,
                message="Configure LLM model and API key before testing.",
                detail=None,
            )
        if prov and prov != "openai":
            return AdminConnectivityResult(
                ok=False,
                message="Set LLM provider to 'openai' (or leave empty) for OpenAI-compatible APIs.",
                detail=f"Got llm_provider={prov!r}",
            )
        chat_url = chat_completions_url(row.llm_api_base_url)
        body = {
            "model": model,
            "messages": [{"role": "user", "content": 'Reply with exactly the word "OK".'}],
            "max_tokens": 32,
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                r = await client.post(
                    chat_url,
                    headers=headers,
                    json=body,
                )
        except httpx.HTTPError as e:
            return AdminConnectivityResult(
                ok=False,
                message="LLM request failed (network or timeout).",
                detail=str(e)[:800],
            )
        if r.status_code >= 400:
            return AdminConnectivityResult(
                ok=False,
                message="LLM provider returned an error.",
                detail=r.text[:800],
            )
        try:
            data = r.json()
        except Exception:
            return AdminConnectivityResult(
                ok=False,
                message="Unexpected LLM response body.",
                detail=r.text[:400],
            )
        choices = data.get("choices") or []
        preview = ""
        if choices:
            preview = (
                (choices[0].get("message") or {}).get("content") or ""
            ).strip()
        return AdminConnectivityResult(
            ok=True,
            message="LLM connection succeeded.",
            detail=preview[:500] if preview else None,
        )

    async def test_embedding(self) -> AdminConnectivityResult:
        """Single-vector embedding using stored embedding config."""
        try:
            emb = EmbeddingService(self.db)
            vectors = await emb.embed_batch(["Atelier connectivity probe"])
        except ApiError as e:
            detail = e.detail if isinstance(e.detail, str) else str(e.detail)
            return AdminConnectivityResult(
                ok=False,
                message="Embedding call failed.",
                detail=detail,
            )
        except Exception as e:
            return AdminConnectivityResult(
                ok=False,
                message="Embedding request failed.",
                detail=str(e)[:800],
            )
        if not vectors or not vectors[0]:
            return AdminConnectivityResult(
                ok=False,
                message="Embedding API returned no vectors.",
                detail=None,
            )
        dim = len(vectors[0])
        return AdminConnectivityResult(
            ok=True,
            message=f"Embedding connection succeeded ({dim} dimensions).",
            detail=None,
        )
