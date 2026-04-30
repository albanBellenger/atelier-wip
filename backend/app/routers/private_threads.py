"""Private AI thread on a section (SSE assistant reply)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, get_project_access, require_project_member
from app.exceptions import ApiError
from app.main import limiter
from app.schemas.private_thread import (
    PrivateThreadDetail,
    PrivateThreadStreamBody,
    ThreadMessageOut,
)
from app.services.llm_service import LLMService
from app.services.private_thread_service import PrivateThreadService

router = APIRouter(
    prefix="/projects/{project_id}/sections/{section_id}/private-thread",
    tags=["private-thread"],
)


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("", response_model=PrivateThreadDetail)
async def get_private_thread(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> PrivateThreadDetail:
    _ensure_project(pa, project_id)
    svc = PrivateThreadService(session)
    await svc.require_section_in_project(project_id, section_id)
    th = await svc.get_or_create_thread(
        user_id=pa.studio_access.user.id,
        section_id=section_id,
    )
    msgs = await svc.list_messages(th.id)
    return PrivateThreadDetail(
        thread_id=th.id,
        messages=[ThreadMessageOut.model_validate(m) for m in msgs],
    )


@router.post("/messages/stream")
# SlowAPIASGIMiddleware replays http.response.start before every body chunk when wrapping
# send(); multi-chunk StreamingResponse then violates ASGI ordering. Exempt uses raw send.
@limiter.exempt
async def stream_private_thread_reply(
    project_id: UUID,
    section_id: UUID,
    body: PrivateThreadStreamBody,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> StreamingResponse:
    _ensure_project(pa, project_id)
    # Must validate LLM config before StreamingResponse: headers are sent before the
    # stream body runs; ApiError inside the iterator surfaces as a 500 / runtime error.
    await LLMService(session).ensure_openai_llm_ready()
    svc = PrivateThreadService(session)

    async def gen():
        async for chunk in svc.stream_assistant(
            project_id=project_id,
            section_id=section_id,
            user_id=pa.studio_access.user.id,
            content=body.content,
        ):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
