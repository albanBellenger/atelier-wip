"""Project knowledge graph."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, get_project_access, require_project_member
from app.exceptions import ApiError
from app.schemas.graph import GraphAnalyzeResponse, ProjectGraphResponse
from app.agents.section_relationship_agent import SectionRelationshipAgent
from app.services.graph_service import GraphService
from app.services.llm_service import LLMService

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
async def analyze_section_relationships(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> GraphAnalyzeResponse:
    _ensure_project(pa, project_id)
    llm = LLMService(session)
    await SectionRelationshipAgent(session, llm).detect_section_relationships(
        project_id,
        context_user_id=pa.studio_access.user.id,
    )
    await session.commit()
    return GraphAnalyzeResponse(
        message="Cross-section reference scan complete.",
    )
