"""Project-wide chat: REST history + WebSocket room."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketDisconnect

from app.database import async_session_factory, get_db
from app.deps import ProjectAccess, fetch_project_access, get_project_access
from app.exceptions import ApiError
from app.schemas.project_chat import ChatHistoryResponse, ChatMessageOut
from app.services.auth_service import AuthService
from app.services.chat_room_registry import broadcast_json, register, unregister
from app.services.llm_service import LLMService
from app.services.project_chat_service import ProjectChatService

router = APIRouter(tags=["project-chat"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("/projects/{project_id}/chat", response_model=ChatHistoryResponse)
async def get_project_chat_history(
    project_id: UUID,
    before: UUID | None = Query(None, description="Older messages page cursor."),
    limit: int = Query(30, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> ChatHistoryResponse:
    _ensure_project(pa, project_id)
    if not pa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio editor access required for project chat.",
        )
    rows, next_before = await ProjectChatService(session).list_history(
        project_id=project_id,
        before_id=before,
        limit=limit,
    )
    return ChatHistoryResponse(
        messages=[ChatMessageOut.model_validate(m) for m in rows],
        next_before=next_before,
    )


async def _ws_user_token(websocket: WebSocket) -> str:
    token = websocket.cookies.get("atelier_token")
    if not token:
        token = websocket.query_params.get("token")
    if not token:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Not authenticated",
        )
    return token


@router.websocket("/ws/projects/{project_id}/chat")
async def project_chat_websocket(
    websocket: WebSocket,
    project_id: UUID,
) -> None:
    close_on_fail = {401: 4401, 403: 4403}

    async with async_session_factory() as session:
        try:
            token = await _ws_user_token(websocket)
            user = await AuthService(session).get_user_from_token(token)
            pa = await fetch_project_access(session, user, project_id)
            if not pa.studio_access.is_studio_editor:
                await session.commit()
                await websocket.close(code=4403)
                return
            await session.commit()
        except ApiError as e:
            await session.rollback()
            await websocket.close(code=close_on_fail.get(e.status_code, 1008))
            return

    await websocket.accept()
    await register(project_id, websocket)
    user_id = pa.studio_access.user.id

    try:
        while True:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "message": "Invalid JSON"}
                )
                continue
            if data.get("type") != "user_message":
                await websocket.send_json(
                    {"type": "error", "message": "Expected type user_message"}
                )
                continue
            content = (data.get("content") or "").strip()
            if not content:
                await websocket.send_json(
                    {"type": "error", "message": "content is required"}
                )
                continue

            async with async_session_factory() as session:
                await LLMService(session).ensure_openai_llm_ready()
                svc = ProjectChatService(session)
                user_msg = await svc.append_message(
                    project_id=project_id,
                    user_id=user_id,
                    role="user",
                    content=content,
                )
                await session.commit()

            await broadcast_json(
                project_id,
                {
                    "type": "user_message",
                    "id": str(user_msg.id),
                    "user_id": str(user_id),
                    "content": content,
                    "created_at": user_msg.created_at.isoformat(),
                },
            )

            buf: list[str] = []
            async with async_session_factory() as session:
                svc = ProjectChatService(session)
                async for piece, _ctx in svc.stream_assistant_tokens(
                    project_id=project_id,
                    user_id=user_id,
                    user_content=content,
                ):
                    buf.append(piece)
                    await broadcast_json(
                        project_id,
                        {"type": "assistant_token", "text": piece},
                    )
                full = "".join(buf)
                if not full.strip():
                    full = "[empty response]"
                asst = await svc.append_message(
                    project_id=project_id,
                    user_id=None,
                    role="assistant",
                    content=full,
                )
                await session.commit()

            await broadcast_json(
                project_id,
                {
                    "type": "assistant_done",
                    "message_id": str(asst.id),
                    "content": full,
                },
            )
    finally:
        await unregister(project_id, websocket)
