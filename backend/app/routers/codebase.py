"""Software codebase snapshot API (GitLab index)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    SoftwareAccess,
    get_software_access,
    require_platform_admin,
    require_software_home_editor,
)
from app.exceptions import ApiError
from app.models import CodebaseFile, Software, User
from app.schemas.code_drift import CodeDriftRunResult
from app.schemas.codebase import CodebaseDiagnosticsResponse, CodebaseSnapshotResponse
from app.services.code_drift_service import CodeDriftService
from app.services.codebase_pipeline import enqueue_codebase_index
from app.services.codebase_rag_service import CodebaseRagService
from app.services.codebase_repo_map import repo_map_lru
from app.services.codebase_service import CodebaseService
from app.services.llm_service import LLMService

router = APIRouter(
    prefix="/software/{software_id}/codebase",
    tags=["codebase"],
)


@router.post("/reindex", response_model=CodebaseSnapshotResponse)
async def request_codebase_reindex(
    software_id: UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_home_editor),
) -> CodebaseSnapshotResponse:
    svc = CodebaseService(session)
    snap = await svc.create_pending_snapshot(
        software_id=software_id,
        triggered_by_user_id=sa.studio_access.user.id,
    )
    detail = await svc.get_snapshot_detail(software_id, snap.id)
    # BackgroundTasks run after the response is sent, before the request-scoped
    # session commits. enqueue_codebase_index opens a new session and must see
    # this row, so persist the pending snapshot before scheduling the task.
    await session.commit()

    async def _run() -> None:
        await enqueue_codebase_index(snap.id)

    background_tasks.add_task(_run)
    return detail


@router.post("/code-drift/run", response_model=CodeDriftRunResult)
async def run_code_drift(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_home_editor),
) -> CodeDriftRunResult:
    llm = LLMService(session)
    result = await CodeDriftService(session, llm).run_for_software(
        software_id,
        sa.studio_access.user.id,
    )
    await session.commit()
    return result


@router.get("/snapshots", response_model=list[CodebaseSnapshotResponse])
async def list_codebase_snapshots(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> list[CodebaseSnapshotResponse]:
    return await CodebaseService(session).list_snapshots(software_id)


@router.get("/snapshots/{snapshot_id}", response_model=CodebaseSnapshotResponse)
async def get_codebase_snapshot(
    software_id: UUID,
    snapshot_id: UUID,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> CodebaseSnapshotResponse:
    return await CodebaseService(session).get_snapshot_detail(software_id, snapshot_id)


@router.get("/diagnostics", response_model=CodebaseDiagnosticsResponse)
async def codebase_diagnostics(
    software_id: UUID,
    q: str = "",
    session: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
) -> CodebaseDiagnosticsResponse:
    sw = await session.get(Software, software_id)
    if sw is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found")
    svc = CodebaseService(session)
    ready = await svc.get_ready_snapshot(software_id)
    if ready is None:
        return CodebaseDiagnosticsResponse(repo_map={}, hits=[])
    paths = (
        await session.scalars(select(CodebaseFile.path).where(CodebaseFile.snapshot_id == ready.id))
    ).all()
    budget = max(400, min(6000, len(q.strip()) * 4 + 1200))
    rm = repo_map_lru(str(ready.id), budget, list(paths))
    rag = CodebaseRagService(session)
    hits = await rag.retrieve_chunks_for_text(
        snapshot_id=ready.id,
        software_id=software_id,
        query_text=q,
        limit=10,
    )
    return CodebaseDiagnosticsResponse(repo_map=rm, hits=hits)
