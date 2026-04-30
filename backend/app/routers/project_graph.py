"""Project knowledge graph."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, get_project_access
from app.exceptions import ApiError
from app.schemas.graph import GraphAnalyzeResponse, ProjectGraphResponse
from app.services.graph_service import GraphService

router = APIRouter(prefix="/projects/{project_id}", tags=["graph"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("/graph", response_model=ProjectGraphResponse)
async def get_project_graph(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> ProjectGraphResponse:
    _ensure_project(pa, project_id)
    raw = await GraphService(session).get_graph(project_id)
    return ProjectGraphResponse.model_validate(raw)


@router.post("/graph/analyze-sections", response_model=GraphAnalyzeResponse)
async def analyze_section_relationships_stub(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> GraphAnalyzeResponse:
    """Reserved for Slice 11 publish-time LLM section pair analysis."""
    _ensure_project(pa, project_id)
    await GraphService(session).detect_section_relationships(project_id)
    return GraphAnalyzeResponse(
        message="Cross-section relationship analysis runs on publish (Slice 11); no edges added yet.",
    )
