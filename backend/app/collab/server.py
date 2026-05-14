"""Yjs collaborative editing: pycrdt-websocket server + debounced Postgres persistence."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, NamedTuple
from uuid import UUID

from pycrdt import Doc, TransactionEvent
from pycrdt.websocket import WebsocketServer, YRoom, exception_logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.websockets import WebSocketDisconnect

from app.collab.editor_context import collab_acting_user_id
from app.models import Section, Software
from app.services.notification_dispatch_service import NotificationDispatchService
from app.services.section_service import SECTION_YJS_TEXT_FIELD
from app.services.software_activity_service import SoftwareActivityService

log = logging.getLogger("atelier.collab")

_collab_server: WebsocketServer | None = None

_UUID = r"[0-9a-fA-F-]{36}"
_PATH_PROJECT = re.compile(
    rf"^/ws/projects/(?P<pid>{_UUID})/sections/(?P<sid>{_UUID})/collab$"
)
_PATH_SOFTWARE_DOC = re.compile(
    rf"^/ws/software/(?P<sfid>{_UUID})/docs/(?P<sid>{_UUID})/collab$"
)


class CollabRoomTarget(NamedTuple):
    """Resolved collab room: either a project spec section or a software doc section."""

    section_id: UUID
    project_id: UUID | None
    software_id: UUID | None


def collab_room_path(project_id: UUID, section_id: UUID) -> str:
    return f"/ws/projects/{project_id}/sections/{section_id}/collab"


def software_docs_collab_room_path(software_id: UUID, section_id: UUID) -> str:
    return f"/ws/software/{software_id}/docs/{section_id}/collab"


def parse_collab_room(path: str) -> CollabRoomTarget:
    m = _PATH_PROJECT.match(path)
    if m:
        return CollabRoomTarget(
            section_id=UUID(m.group("sid")),
            project_id=UUID(m.group("pid")),
            software_id=None,
        )
    m2 = _PATH_SOFTWARE_DOC.match(path)
    if m2:
        return CollabRoomTarget(
            section_id=UUID(m2.group("sid")),
            project_id=None,
            software_id=UUID(m2.group("sfid")),
        )
    raise ValueError(f"invalid collab path: {path!r}")


def parse_collab_path(path: str) -> tuple[UUID, UUID]:
    """Backward-compatible parser for project section rooms only."""
    t = parse_collab_room(path)
    if t.project_id is None:
        raise ValueError(f"invalid collab path: {path!r}")
    return t.project_id, t.section_id


def get_collab_server() -> WebsocketServer:
    if _collab_server is None:
        raise RuntimeError("collab server not initialized")
    return _collab_server


def init_collab_server(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    debounce_s: float | None = None,
) -> WebsocketServer:
    global _collab_server
    _collab_server = AtelierWebsocketServer(
        session_factory,
        debounce_s=debounce_s,
    )
    return _collab_server


def _is_client_disconnect(exc: BaseException) -> bool:
    """True when the peer closed the socket or the transport died mid-flight."""
    if isinstance(exc, WebSocketDisconnect):
        return True
    name = type(exc).__name__
    mod = type(exc).__module__ or ""
    if name == "ClientDisconnected":
        return True
    if name in ("ConnectionClosedError", "ConnectionClosed"):
        return True
    if mod.startswith("websockets.") and "Closed" in name:
        return True
    if isinstance(exc, OSError) and getattr(exc, "errno", None) in (
        104,
        10054,
        10053,
    ):
        return True
    if isinstance(exc, asyncio.exceptions.IncompleteReadError):
        return True
    if isinstance(exc, BaseExceptionGroup):
        return bool(exc.exceptions) and all(
            _is_client_disconnect(e) for e in exc.exceptions
        )
    cause = exc.__cause__
    if isinstance(cause, BaseException):
        return _is_client_disconnect(cause)
    ctx = exc.__context__
    if isinstance(ctx, BaseException) and ctx is not cause:
        return _is_client_disconnect(ctx)
    return False


def collab_exception_handler(exc: Exception, lg: logging.Logger) -> bool:
    """Downgrade expected disconnect noise from pycrdt TaskGroups."""
    if _is_client_disconnect(exc):
        lg.debug("collab: websocket ended (%s)", type(exc).__name__)
        return True
    return exception_logger(exc, lg)


class AtelierWebsocketServer(WebsocketServer):
    """Per-section YRoom with hydrated Doc and debounced dual-write to sections."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        debounce_s: float | None = None,
        **kwargs: Any,
    ) -> None:
        d = debounce_s
        if d is None:
            d = float(os.environ.get("ATELIER_COLLAB_DEBOUNCE_SECONDS", "2"))
        super().__init__(
            auto_clean_rooms=True,
            exception_handler=collab_exception_handler,
            log=log,
            **kwargs,
        )
        self._session_factory = session_factory
        self._debounce_s = d
        self._persist_tasks: dict[str, asyncio.Task[None]] = {}
        self._pending_markdown_by_room: dict[str, str] = {}

    async def get_room(self, name: str) -> YRoom:
        if name not in self.rooms:
            doc = await self._load_doc(name)
            room = YRoom(ready=True, ydoc=doc, log=self.log)
            self.rooms[name] = room
            self._attach_persist_observer(room, name)
        room = self.rooms[name]
        await self.start_room(room)
        return room

    async def delete_room(
        self,
        *,
        name: str | None = None,
        room: YRoom | None = None,
    ) -> None:
        if name is not None and room is not None:
            raise RuntimeError("Cannot pass name and room")
        key = name
        if key is None:
            assert room is not None
            key = next((k for k, v in self.rooms.items() if v is room), None)
            if key is None:
                # Already removed (e.g. concurrent auto_clean / double delete).
                log.debug("collab: delete_room skipped, room not in registry")
                return
        if key not in self.rooms:
            t = self._persist_tasks.pop(key, None)
            if t is not None and not t.done():
                t.cancel()
            self._pending_markdown_by_room.pop(key, None)
            log.debug("collab: delete_room skipped, %r not in registry", key)
            return
        t = self._persist_tasks.pop(key, None)
        if t is not None and not t.done():
            t.cancel()
        self._pending_markdown_by_room.pop(key, None)
        await super().delete_room(name=key, room=None)

    def _validate_section_for_room(
        self, sec: Section, target: CollabRoomTarget
    ) -> bool:
        if target.project_id is not None:
            return sec.project_id == target.project_id
        return (
            sec.software_id == target.software_id
            and sec.project_id is None
            and target.software_id is not None
        )

    def enqueue_markdown_snapshot(self, room_path: str, content: str) -> None:
        """Client-pushed Markdown for ``sections.content`` (same debounce as Yjs binary)."""
        if len(content) > 5_000_000:
            log.warning("collab: markdown_snapshot too large on %s", room_path)
            return
        self._pending_markdown_by_room[room_path] = content
        room = self.rooms.get(room_path)
        if room is None:
            log.debug("collab: markdown_snapshot for unknown room %s", room_path)
            return
        target = parse_collab_room(room_path)
        self._schedule_persist(room_path, target, room)

    def _schedule_persist(
        self,
        room_name: str,
        target: CollabRoomTarget,
        room: YRoom,
    ) -> None:
        t = self._persist_tasks.get(room_name)
        if t is not None and not t.done():
            t.cancel()
        self._persist_tasks[room_name] = asyncio.create_task(
            self._debounced_persist(room_name, target, room)
        )

    async def _load_doc(self, room_path: str) -> Doc:
        target = parse_collab_room(room_path)
        async with self._session_factory() as session:
            sec = await session.get(Section, target.section_id)
            if sec is None or not self._validate_section_for_room(sec, target):
                raise ValueError("Section not found for collab room")
            doc = Doc()
            if sec.yjs_state:
                raw = bytes(sec.yjs_state)
                try:
                    doc.apply_update(raw)
                except ValueError:
                    log.warning(
                        "collab: invalid yjs_state for section %s (wrong encoding or "
                        "legacy get_state blob); clearing yjs_state (client re-seeds)",
                        target.section_id,
                    )
                    doc = Doc()
                    sec.yjs_state = None
                    await session.commit()
                else:
                    if SECTION_YJS_TEXT_FIELD in doc:
                        log.warning(
                            "collab: legacy outline-editor-v2 Y.Text (%r) in yjs_state "
                            "for section %s; clearing (Crepe/y-prosemirror re-seeds)",
                            SECTION_YJS_TEXT_FIELD,
                            target.section_id,
                        )
                        doc = Doc()
                        sec.yjs_state = None
                        await session.commit()
            return doc

    def _attach_persist_observer(self, room: YRoom, room_name: str) -> None:
        target = parse_collab_room(room_name)

        def on_change(_event: TransactionEvent) -> None:
            self._schedule_persist(room_name, target, room)

        room.ydoc.observe(on_change)

    async def _debounced_persist(
        self,
        room_name: str,
        target: CollabRoomTarget,
        room: YRoom,
    ) -> None:
        await asyncio.sleep(self._debounce_s)
        if room_name not in self.rooms:
            return
        await self._persist_to_db(room_name, target, room.ydoc)

    async def _persist_to_db(
        self,
        room_name: str,
        target: CollabRoomTarget,
        doc: Doc,
    ) -> None:
        # Must store Yjs *update* bytes (full snapshot from empty), not get_state().
        # apply_update() cannot load get_state() output — it expects mergeable updates
        # compatible with JS Yjs encodeStateAsUpdate / Y.Sync.
        _MISSING = object()
        snapshot = doc.get_update()
        pending_md = self._pending_markdown_by_room.pop(room_name, _MISSING)
        editor = collab_acting_user_id.get()
        changed = False
        section_title = ""
        async with self._session_factory() as session:
            sec = await session.get(Section, target.section_id)
            if sec is None or not self._validate_section_for_room(sec, target):
                return
            old_content = sec.content or ""
            old_yjs = sec.yjs_state
            section_title = sec.title
            sec.yjs_state = snapshot
            if pending_md is not _MISSING:
                sec.content = pending_md
            new_content = sec.content or ""
            yjs_changed = bytes(sec.yjs_state or b"") != bytes(old_yjs or b"")
            content_changed = new_content != old_content
            changed = yjs_changed or content_changed
            if changed and editor is not None:
                sec.last_edited_by_id = editor
            await session.commit()
        if not changed:
            return
        from app.services.drift_pipeline import schedule_drift_check
        from app.services.embedding_pipeline import schedule_section_embedding

        schedule_section_embedding(target.section_id)
        schedule_drift_check(target.section_id)
        if editor is None:
            return
        try:
            async with self._session_factory() as session2:
                nd = NotificationDispatchService(session2)
                if target.project_id is not None:
                    await nd.section_updated_by_other(
                        project_id=target.project_id,
                        section_id=target.section_id,
                        section_title=section_title,
                        actor_user_id=editor,
                    )
                elif target.software_id is not None:
                    sw = await session2.get(Software, target.software_id)
                    if sw is not None:
                        await SoftwareActivityService(session2).record(
                            software_id=target.software_id,
                            studio_id=sw.studio_id,
                            actor_user_id=editor,
                            verb="software_doc_section_updated",
                            summary=f"Updated software doc «{section_title}»",
                            entity_type="software_doc_section",
                            entity_id=target.section_id,
                        )
                    await nd.software_doc_section_updated_by_other(
                        software_id=target.software_id,
                        section_id=target.section_id,
                        section_title=section_title,
                        actor_user_id=editor,
                    )
                await session2.commit()
        except Exception:
            log.warning("collab_section_notification_failed", exc_info=True)
