"""Software-wide chat: REST history + WebSocket room."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketDisconnect

from app.database import async_session_factory, get_db
from app.deps import SoftwareAccess, fetch_software_access, get_software_access
from app.exceptions import ApiError
from app.schemas.software_chat import (
    SoftwareChatHistoryResponse,
    SoftwareChatMessageOut,
)
from app.services.auth_service import AuthService
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.chat_history_window import HISTORY_TRIM_NOTICE
from app.services.llm_service import LLMService
from app.services.software_chat_room_registry import (
    broadcast_json,
    register,
    unregister,
)
from app.services.software_chat_service import SoftwareChatService

router = APIRouter(tags=["software-chat"])


def _ensure_software(sa: SoftwareAccess, software_id: UUID) -> None:
    if sa.software.id != software_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Software not found.",
        )


@router.get("/software/{software_id}/chat", response_model=SoftwareChatHistoryResponse)
async def get_software_chat_history(
    software_id: UUID,
    before: UUID | None = Query(None, description="Older messages page cursor."),
    limit: int = Query(30, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(get_software_access),
) -> SoftwareChatHistoryResponse:
    _ensure_software(sa, software_id)
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio Owner or Builder access required for software chat.",
        )
    rows, next_before = await SoftwareChatService(session).list_history(
        software_id=software_id,
        before_id=before,
        limit=limit,
    )
    return SoftwareChatHistoryResponse(
        messages=[SoftwareChatMessageOut.model_validate(m) for m in rows],
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


@router.websocket("/ws/software/{software_id}/chat")
async def software_chat_websocket(
    websocket: WebSocket,
    software_id: UUID,
) -> None:
    close_on_fail = {401: 4401, 403: 4403}

    user_id: UUID
    studio_id_scope: UUID
    async with async_session_factory() as session:
        try:
            token = await _ws_user_token(websocket)
            user = await AuthService(session).get_user_from_token(token)
            sa = await fetch_software_access(session, user, software_id)
            if not sa.studio_access.is_studio_editor:
                await session.commit()
                await websocket.close(code=4403)
                return
            user_id = user.id
            studio_id_scope = sa.studio_access.studio_id
            await session.commit()
        except ApiError as e:
            await session.rollback()
            await websocket.close(code=close_on_fail.get(e.status_code, 1008))
            return

    await websocket.accept()
    await register(software_id, websocket)

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

            raw_m = data.get("model")
            preferred_model: str | None = None
            if isinstance(raw_m, str) and raw_m.strip():
                preferred_model = raw_m.strip()

            trim_notice_msg = None
            trimmed_for_stream: list[dict[str, str]] = []
            try:
                async with async_session_factory() as session:
                    probe_ctx = TokenUsageScope(
                        studio_id=studio_id_scope,
                        software_id=software_id,
                        user_id=user_id,
                    )
                    await LLMService(session).ensure_openai_llm_ready(
                        usage_scope=probe_ctx,
                        call_type="chat",
                        preferred_model=preferred_model,
                    )
                    svc = SoftwareChatService(session)
                    user_msg = await svc.append_message(
                        software_id=software_id,
                        user_id=user_id,
                        role="user",
                        content=content,
                    )
                    hist = await svc.openai_messages_for_software(software_id)
                    llm_trim = LLMService(session)
                    trimmed_for_stream, trimmed = await llm_trim.trim_chat_messages_for_stream(
                        hist,
                        usage_scope=probe_ctx,
                        call_type="chat",
                        preferred_model=preferred_model,
                    )
                    if trimmed:
                        trim_notice_msg = await svc.append_message(
                            software_id=software_id,
                            user_id=None,
                            role="assistant",
                            content=HISTORY_TRIM_NOTICE,
                        )
                    await session.commit()
            except ApiError as e:
                det = e.detail
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": det if isinstance(det, str) else str(det),
                    }
                )
                continue

            await broadcast_json(
                software_id,
                {
                    "type": "user_message",
                    "id": str(user_msg.id),
                    "user_id": str(user_id),
                    "content": content,
                    "created_at": user_msg.created_at.isoformat(),
                },
            )

            if trim_notice_msg is not None:
                await broadcast_json(
                    software_id,
                    {
                        "type": "assistant_message",
                        "id": str(trim_notice_msg.id),
                        "user_id": None,
                        "content": HISTORY_TRIM_NOTICE,
                        "created_at": trim_notice_msg.created_at.isoformat(),
                    },
                )

            buf: list[str] = []
            async with async_session_factory() as session:
                svc = SoftwareChatService(session)
                async for piece, _ctx in svc.stream_assistant_tokens(
                    software_id=software_id,
                    user_id=user_id,
                    user_content=content,
                    preferred_model=preferred_model,
                    chat_messages=trimmed_for_stream,
                ):
                    buf.append(piece)
                    await broadcast_json(
                        software_id,
                        {"type": "assistant_token", "text": piece},
                    )
                full = "".join(buf)
                if not full.strip():
                    full = "[empty response]"
                asst = await svc.append_message(
                    software_id=software_id,
                    user_id=None,
                    role="assistant",
                    content=full,
                )
                await session.commit()

            await broadcast_json(
                software_id,
                {
                    "type": "assistant_done",
                    "message_id": str(asst.id),
                    "content": full,
                },
            )
    finally:
        await unregister(software_id, websocket)
