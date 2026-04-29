"""Yjs collaborative editing: pycrdt-websocket server + debounced Postgres persistence."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any
from uuid import UUID

from pycrdt import Doc, Text, TransactionEvent
from pycrdt.websocket import WebsocketServer, YRoom, exception_logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Section

log = logging.getLogger("atelier.collab")

# Must match y-codemirror.next + yCollab default shared text field name.
YDOC_TEXT_FIELD = "codemirror"

_collab_server: WebsocketServer | None = None

_PATH_RE = re.compile(
    r"^/ws/projects/(?P<pid>[0-9a-fA-F-]{36})/sections/(?P<sid>[0-9a-fA-F-]{36})/collab$"
)


def collab_room_path(project_id: UUID, section_id: UUID) -> str:
    return f"/ws/projects/{project_id}/sections/{section_id}/collab"


def parse_collab_path(path: str) -> tuple[UUID, UUID]:
    m = _PATH_RE.match(path)
    if not m:
        raise ValueError(f"invalid collab path: {path!r}")
    return UUID(m.group("pid")), UUID(m.group("sid"))


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
            exception_handler=exception_logger,
            log=log,
            **kwargs,
        )
        self._session_factory = session_factory
        self._debounce_s = d
        self._persist_tasks: dict[str, asyncio.Task[None]] = {}

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
            key = self.get_room_name(room)
        t = self._persist_tasks.pop(key, None)
        if t is not None and not t.done():
            t.cancel()
        await super().delete_room(name=name, room=room)

    async def _load_doc(self, room_path: str) -> Doc:
        project_id, section_id = parse_collab_path(room_path)
        async with self._session_factory() as session:
            sec = await session.get(Section, section_id)
            if sec is None or sec.project_id != project_id:
                raise ValueError("Section not found for collab room")
            doc = Doc()
            if sec.yjs_state:
                doc.apply_update(bytes(sec.yjs_state))
            elif sec.content:
                doc[YDOC_TEXT_FIELD] = Text(sec.content)
            return doc

    def _attach_persist_observer(self, room: YRoom, room_name: str) -> None:
        project_id, section_id = parse_collab_path(room_name)

        def on_change(_event: TransactionEvent) -> None:
            t = self._persist_tasks.get(room_name)
            if t is not None and not t.done():
                t.cancel()
            self._persist_tasks[room_name] = asyncio.create_task(
                self._debounced_persist(room_name, project_id, section_id, room)
            )

        room.ydoc.observe(on_change)

    async def _debounced_persist(
        self,
        room_name: str,
        project_id: UUID,
        section_id: UUID,
        room: YRoom,
    ) -> None:
        await asyncio.sleep(self._debounce_s)
        if room_name not in self.rooms:
            return
        await self._persist_to_db(project_id, section_id, room.ydoc)

    async def _persist_to_db(
        self,
        project_id: UUID,
        section_id: UUID,
        doc: Doc,
    ) -> None:
        state = doc.get_state()
        text = ""
        if YDOC_TEXT_FIELD in doc:
            text = str(doc[YDOC_TEXT_FIELD])
        async with self._session_factory() as session:
            sec = await session.get(Section, section_id)
            if sec is None or sec.project_id != project_id:
                return
            sec.yjs_state = state
            sec.content = text
            await session.commit()
