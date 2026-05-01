"""Private AI thread on a section (SSE assistant reply)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, require_project_member
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
    prefix="/projects/{project_id}/sections/{section_id}/thread",
    tags=["private-thread"],
)


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.delete("", status_code=204)
async def reset_private_thread(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> Response:
    _ensure_project(pa, project_id)
    svc = PrivateThreadService(session)
    await svc.require_section_in_project(project_id, section_id)
    await svc.reset_thread(
        user_id=pa.studio_access.user.id,
        section_id=section_id,
    )
    return Response(status_code=204)


@router.get("", response_model=PrivateThreadDetail)
async def get_private_thread(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
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


@router.post("/messages")
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
    await svc.assert_thread_stream_request_valid(
        project_id=project_id,
        section_id=section_id,
        body=body,
    )

    async def gen():
        async for chunk in svc.stream_assistant(
            project_id=project_id,
            section_id=section_id,
            user_id=pa.studio_access.user.id,
            content=body.content,
            current_section_plaintext=body.current_section_plaintext,
            include_git_history=body.include_git_history,
            selection_from=body.selection_from,
            selection_to=body.selection_to,
            selected_plaintext=body.selected_plaintext,
            include_selection_in_context=body.include_selection_in_context,
            thread_intent=body.thread_intent,
            command=body.command,
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
