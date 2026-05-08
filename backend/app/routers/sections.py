"""Sections under a project."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import (
    ProjectAccess,
    get_project_access,
    require_outline_manager,
    require_project_member,
)
from app.exceptions import ApiError
from app.schemas.citation_health import CitationHealthOut
from app.schemas.context_preview import ContextPreviewOut
from app.schemas.section import (
    SectionCreate,
    SectionReorder,
    SectionResponse,
    SectionUpdate,
)
from app.schemas.section_context_preferences import (
    SectionContextPrefsOut,
    SectionContextPrefsPatch,
)
from app.schemas.section_health import SectionHealthOut
from app.schemas.section_improve import SectionImproveBody, SectionImproveOut
from app.services.citation_health_service import CitationHealthService
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService
from app.services.section_context_preferences_service import (
    SectionContextPreferencesService,
)
from app.services.section_health_service import SectionHealthService
from app.services.section_service import SectionService

router = APIRouter(prefix="/projects/{project_id}/sections", tags=["sections"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("", response_model=list[SectionResponse])
async def list_sections(
    project_id: UUID,
    include_outline_health: bool = Query(
        False,
        description="When true, each section includes outline_health (batched drift/gap/tokens; no citation LLM).",
    ),
    session: AsyncSession = Depends(get_db),
    _pa=Depends(get_project_access),
) -> list[SectionResponse]:
    return await SectionService(session).list_sections(
        project_id, include_outline_health=include_outline_health
    )


@router.post("", response_model=SectionResponse)
async def create_section(
    project_id: UUID,
    body: SectionCreate,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_outline_manager),
) -> SectionResponse:
    return await SectionService(session).create_section(project_id, body)


@router.post("/reorder", response_model=list[SectionResponse])
async def reorder_sections(
    project_id: UUID,
    body: SectionReorder,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_outline_manager),
) -> list[SectionResponse]:
    return await SectionService(session).reorder_sections(
        project_id, body.section_ids
    )


@router.get("/{section_id}/context-preview", response_model=ContextPreviewOut)
async def get_section_context_preview(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
    q: str = Query("", max_length=8000, description="RAG query for chunk retrieval"),
    token_budget: int = Query(6000, ge=100, le=50_000),
    include_git_history: bool = Query(False),
    debug_raw_rag: bool = Query(
        False,
        description="Dev/staging only: include debug_raw_rag_text (same string as build_context).",
    ),
) -> ContextPreviewOut:
    _ensure_project(pa, project_id)
    allow_debug = get_settings().env != "production"
    prefs = await SectionContextPreferencesService(session).get_for_user_section(
        pa.studio_access.user.id,
        section_id,
    )
    rag = RAGService(session)
    preview = await rag.build_context_with_blocks(
        q,
        project_id,
        section_id,
        token_budget=token_budget,
        include_git_history=include_git_history,
        include_debug_raw_rag=bool(debug_raw_rag and allow_debug),
    )
    if (
        prefs.excluded_kinds
        or prefs.pinned_artifact_ids
        or prefs.pinned_section_ids
        or prefs.pinned_work_order_ids
        or prefs.extra_urls
    ):
        return await rag.apply_user_context_prefs_to_preview(
            preview, project_id, prefs
        )
    return preview


@router.get("/{section_id}/health", response_model=SectionHealthOut)
async def get_section_health(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
    token_budget: int = Query(6000, ge=100, le=50_000),
) -> SectionHealthOut:
    _ensure_project(pa, project_id)
    return await SectionHealthService(session).get_section_health(
        project_id=project_id,
        section_id=section_id,
        user_id=pa.studio_access.user.id,
        token_budget=token_budget,
    )


@router.get("/{section_id}/citation-health", response_model=CitationHealthOut)
async def get_section_citation_health(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> CitationHealthOut:
    _ensure_project(pa, project_id)
    return await CitationHealthService(session).analyze_section(
        project_id=project_id,
        section_id=section_id,
        user_id=pa.studio_access.user.id,
    )


@router.get(
    "/{section_id}/context-preferences",
    response_model=SectionContextPrefsOut,
)
async def get_section_context_preferences(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> SectionContextPrefsOut:
    _ensure_project(pa, project_id)
    return await SectionContextPreferencesService(session).get_for_user_section(
        pa.studio_access.user.id,
        section_id,
    )


@router.patch(
    "/{section_id}/context-preferences",
    response_model=SectionContextPrefsOut,
)
async def patch_section_context_preferences(
    project_id: UUID,
    section_id: UUID,
    body: SectionContextPrefsPatch,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> SectionContextPrefsOut:
    _ensure_project(pa, project_id)
    return await SectionContextPreferencesService(session).patch_for_user_section(
        pa.studio_access.user.id,
        section_id,
        body,
    )


@router.post("/{section_id}/improve", response_model=SectionImproveOut)
async def post_section_improve(
    project_id: UUID,
    section_id: UUID,
    body: SectionImproveBody,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> SectionImproveOut:
    _ensure_project(pa, project_id)
    ctx = TokenUsageScope(
        studio_id=pa.studio_access.studio_id,
        software_id=pa.software.id,
        project_id=project_id,
        user_id=pa.studio_access.user.id,
    )
    await LLMService(session).ensure_openai_llm_ready(usage_scope=ctx, call_type="chat")
    text = await SectionService(session).improve_section_markdown(
        project_id,
        section_id,
        instruction=body.instruction,
        current_section_plaintext=body.current_section_plaintext,
        user_id=pa.studio_access.user.id,
    )
    return SectionImproveOut(improved_markdown=text)


@router.get("/{section_id}", response_model=SectionResponse)
async def get_section(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> SectionResponse:
    _ensure_project(pa, project_id)
    return await SectionService(session).get_section(project_id, section_id)


@router.patch("/{section_id}", response_model=SectionResponse)
async def update_section(
    project_id: UUID,
    section_id: UUID,
    body: SectionUpdate,
    session: AsyncSession = Depends(get_db),
    pa=Depends(require_project_member),
) -> SectionResponse:
    return await SectionService(session).update_section(
        project_id,
        section_id,
        body,
        is_studio_admin=pa.studio_access.is_studio_admin,
        actor_user_id=pa.studio_access.user.id,
    )


@router.delete("/{section_id}", status_code=204)
async def delete_section(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_outline_manager),
) -> Response:
    await SectionService(session).delete_section(
        project_id,
        section_id,
        actor_is_studio_admin=pa.studio_access.is_studio_admin,
    )
    return Response(status_code=204)
