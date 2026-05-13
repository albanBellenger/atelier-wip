"""WebSocket collaborative editing for sections."""

from uuid import UUID

from fastapi import APIRouter, WebSocket

from app.collab.channel import FastAPIWebSocketChannel, MarkdownSnapshotDemuxChannel
from app.collab.editor_context import collab_acting_user_id
from app.collab.server import (
    AtelierWebsocketServer,
    collab_room_path,
    get_collab_server,
    software_docs_collab_room_path,
)
from app.database import async_session_factory
from app.deps import fetch_project_access, fetch_software_access
from app.exceptions import ApiError
from app.models import Section, User
from app.services.auth_service import AuthService

router = APIRouter(tags=["collab"])


async def _ws_user(session, websocket: WebSocket) -> User:
    token = websocket.cookies.get("atelier_token")
    if not token:
        token = websocket.query_params.get("token")
    if not token:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Not authenticated",
        )
    return await AuthService(session).get_user_from_token(token)


@router.websocket("/ws/projects/{project_id}/sections/{section_id}/collab")
async def section_collab(
    websocket: WebSocket,
    project_id: UUID,
    section_id: UUID,
) -> None:
    async with async_session_factory() as session:
        try:
            user = await _ws_user(session, websocket)
            pa = await fetch_project_access(session, user, project_id)
            if not pa.studio_access.is_studio_editor:
                raise ApiError(
                    status_code=403,
                    code="FORBIDDEN",
                    message="Studio Owner or Builder access required for collaborative editing.",
                )
            sec = await session.get(Section, section_id)
            if sec is None or sec.project_id != project_id:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Section not found",
                )
            await session.commit()
        except ApiError as e:
            await session.rollback()
            close_code = {401: 4401, 403: 4403}.get(e.status_code, 1008)
            await websocket.close(code=close_code)
            return

    await websocket.accept()
    path = collab_room_path(project_id, section_id)
    inner = FastAPIWebSocketChannel(websocket, path)
    server = get_collab_server()
    channel: FastAPIWebSocketChannel | MarkdownSnapshotDemuxChannel = inner
    if isinstance(server, AtelierWebsocketServer):
        channel = MarkdownSnapshotDemuxChannel(inner, server.enqueue_markdown_snapshot)
    var_tok = collab_acting_user_id.set(user.id)
    try:
        await server.serve(channel)
    finally:
        collab_acting_user_id.reset(var_tok)


@router.websocket("/ws/software/{software_id}/docs/{section_id}/collab")
async def software_docs_collab(
    websocket: WebSocket,
    software_id: UUID,
    section_id: UUID,
) -> None:
    async with async_session_factory() as session:
        try:
            user = await _ws_user(session, websocket)
            sa = await fetch_software_access(session, user, software_id)
            if not sa.studio_access.is_studio_editor:
                raise ApiError(
                    status_code=403,
                    code="FORBIDDEN",
                    message="Studio Owner or Builder access required for collaborative editing.",
                )
            sec = await session.get(Section, section_id)
            if (
                sec is None
                or sec.software_id != software_id
                or sec.project_id is not None
            ):
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Section not found",
                )
            await session.commit()
        except ApiError as e:
            await session.rollback()
            close_code = {401: 4401, 403: 4403}.get(e.status_code, 1008)
            await websocket.close(code=close_code)
            return

    await websocket.accept()
    path = software_docs_collab_room_path(software_id, section_id)
    inner = FastAPIWebSocketChannel(websocket, path)
    server = get_collab_server()
    channel: FastAPIWebSocketChannel | MarkdownSnapshotDemuxChannel = inner
    if isinstance(server, AtelierWebsocketServer):
        channel = MarkdownSnapshotDemuxChannel(inner, server.enqueue_markdown_snapshot)
    var_tok = collab_acting_user_id.set(user.id)
    try:
        await server.serve(channel)
    finally:
        collab_acting_user_id.reset(var_tok)
