"""Unit tests for app.collab.server AtelierWebsocketServer and disconnect helpers."""

from __future__ import annotations

import asyncio
import logging
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from pycrdt import Doc, Text
from starlette.websockets import WebSocketDisconnect

from app.collab import server as srv
from app.collab.server import (
    AtelierWebsocketServer,
    CollabRoomTarget,
    _is_client_disconnect,
    collab_exception_handler,
    collab_room_path,
    parse_collab_path,
)
from app.models import Section
from app.services.section_service import SECTION_YJS_TEXT_FIELD


def test_is_client_disconnect_client_disconnected_name() -> None:
    class ClientDisconnected(Exception):
        pass

    assert _is_client_disconnect(ClientDisconnected())


def test_is_client_disconnect_websockets_closed_name() -> None:
    class ProtocolClosedConnection(Exception):
        pass

    ProtocolClosedConnection.__module__ = "websockets.sync.client"
    assert _is_client_disconnect(ProtocolClosedConnection())


def test_is_client_disconnect_incomplete_read() -> None:
    assert _is_client_disconnect(
        asyncio.exceptions.IncompleteReadError(partial=b"", expected=None)
    )


def test_is_client_disconnect_os_errno_10054() -> None:
    e = OSError()
    e.errno = 10054
    assert _is_client_disconnect(e)


def test_is_client_disconnect_os_errno_10053() -> None:
    e = OSError()
    e.errno = 10053
    assert _is_client_disconnect(e)


def test_is_client_disconnect_via_cause() -> None:
    try:
        raise WebSocketDisconnect()
    except WebSocketDisconnect as e:
        outer = RuntimeError("wrap")
        outer.__cause__ = e
        assert _is_client_disconnect(outer)


def test_is_client_disconnect_via_context_not_cause() -> None:
    inner = WebSocketDisconnect()

    class Outer(Exception):
        def __init__(self) -> None:
            super().__init__("x")
            self.__cause__ = None
            self.__context__ = inner

    assert _is_client_disconnect(Outer())


def test_is_client_disconnect_false_for_plain_error() -> None:
    assert not _is_client_disconnect(ValueError("nope"))


def test_collab_exception_handler_disconnect_uses_debug(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG, logger="test.collab")
    lg = logging.getLogger("test.collab")
    assert collab_exception_handler(WebSocketDisconnect(), lg) is True
    assert any("collab: websocket ended" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_atelier_server_debounce_from_env_when_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ATELIER_COLLAB_DEBOUNCE_SECONDS", "0.05")
    factory = MagicMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock()
    cm.__aexit__ = AsyncMock(return_value=None)
    factory.return_value = cm
    old = srv._collab_server
    srv._collab_server = None
    try:
        s = srv.init_collab_server(factory, debounce_s=None)
        assert s._debounce_s == 0.05
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_get_room_loads_and_reuses(monkeypatch: pytest.MonkeyPatch) -> None:
    factory = MagicMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock()
    cm.__aexit__ = AsyncMock(return_value=None)
    factory.return_value = cm

    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        monkeypatch.setattr(server, "_load_doc", AsyncMock(return_value=doc))
        start = AsyncMock()
        monkeypatch.setattr(srv.WebsocketServer, "start_room", start)

        pid, sec_id = uuid.uuid4(), uuid.uuid4()
        path = collab_room_path(pid, sec_id)
        r1 = await server.get_room(path)
        r2 = await server.get_room(path)
        assert r1 is r2
        assert server._load_doc.await_count == 1
        assert start.await_count == 2
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_delete_room_rejects_name_and_room() -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        with pytest.raises(RuntimeError, match="Cannot pass name and room"):
            await server.delete_room(name="x", room=MagicMock())
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_delete_room_cancels_pending_persist(monkeypatch: pytest.MonkeyPatch) -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        monkeypatch.setattr(server, "_load_doc", AsyncMock(return_value=doc))
        monkeypatch.setattr(srv.WebsocketServer, "start_room", AsyncMock())

        pid, sec_id = uuid.uuid4(), uuid.uuid4()
        path = collab_room_path(pid, sec_id)
        await server.get_room(path)

        t = asyncio.create_task(asyncio.sleep(10))
        server._persist_tasks[path] = t
        super_del = AsyncMock()
        monkeypatch.setattr(srv.WebsocketServer, "delete_room", super_del)
        await server.delete_room(name=path)
        await asyncio.sleep(0)
        super_del.assert_awaited_once()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_load_doc_section_not_found() -> None:
    factory = MagicMock()
    session = MagicMock()
    session.get = AsyncMock(return_value=None)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=session)
    cm.__aexit__ = AsyncMock(return_value=None)
    factory.return_value = cm

    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(uuid.uuid4(), uuid.uuid4())
        with pytest.raises(ValueError, match="Section not found"):
            await server._load_doc(path)
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_load_doc_wrong_project() -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=uuid.uuid4(),
        title="T",
        slug="s",
        order=0,
        content="",
    )
    factory, session = _session_with_section(sec)
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(pid, sec_id)
        with pytest.raises(ValueError, match="Section not found"):
            await server._load_doc(path)
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_load_doc_plain_content_does_not_seed_ytext() -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=pid,
        title="T",
        slug="s",
        order=0,
        content="hello",
        yjs_state=None,
    )
    factory, _ = _session_with_section(sec)
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(pid, sec_id)
        doc = await server._load_doc(path)
        assert doc.get_update() == Doc().get_update()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_load_doc_invalid_yjs_clears_blob_empty_doc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=pid,
        title="T",
        slug="s",
        order=0,
        content="fallback text",
        yjs_state=b"\xff\x00\x01",
    )
    factory, session = _session_with_section(sec)
    commit = AsyncMock()
    session.commit = commit
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(pid, sec_id)

        def bad_apply(self: Doc, data: bytes) -> None:
            raise ValueError("bad update")

        monkeypatch.setattr(Doc, "apply_update", bad_apply)
        doc = await server._load_doc(path)
        assert doc.get_update() == Doc().get_update()
        assert sec.yjs_state is None
        commit.assert_awaited()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_load_doc_legacy_codemirror_ytext_clears_blob() -> None:
    """Outline v2 stored Markdown in Y.Text at ``codemirror``; Crepe uses y-prosemirror."""
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    d0 = Doc()
    d0[SECTION_YJS_TEXT_FIELD] = Text("from yjs")
    blob = d0.get_update()

    sec = Section(
        id=sec_id,
        project_id=pid,
        title="T",
        slug="s",
        order=0,
        content="fallback md",
        yjs_state=blob,
    )
    factory, session = _session_with_section(sec)
    commit = AsyncMock()
    session.commit = commit
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(pid, sec_id)
        doc = await server._load_doc(path)
        assert doc.get_update() == Doc().get_update()
        assert sec.yjs_state is None
        commit.assert_awaited()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_debounced_persist_skips_when_room_removed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        room = MagicMock()
        room.ydoc = doc
        pid, sid = uuid.uuid4(), uuid.uuid4()
        path = collab_room_path(pid, sid)
        target = CollabRoomTarget(section_id=sid, project_id=pid, software_id=None)
        persist = AsyncMock()
        monkeypatch.setattr(server, "_persist_to_db", persist)
        monkeypatch.setattr(asyncio, "sleep", AsyncMock())
        await server._debounced_persist(path, target, room)
        persist.assert_not_called()

        server.rooms[path] = room
        await server._debounced_persist(path, target, room)
        persist.assert_awaited_once()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_persist_to_db_without_pending_markdown_keeps_content() -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=pid,
        title="T",
        slug="s",
        order=0,
        content="old",
        yjs_state=None,
    )
    factory, session = _session_with_section(sec)
    commit = AsyncMock()
    session.commit = commit

    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(pid, sec_id)
        target = CollabRoomTarget(section_id=sec_id, project_id=pid, software_id=None)
        doc = Doc()
        await server._persist_to_db(path, target, doc)
        assert sec.content == "old"
        assert sec.yjs_state == doc.get_update()
        commit.assert_awaited()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_persist_to_db_applies_pending_markdown_snapshot() -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=pid,
        title="T",
        slug="s",
        order=0,
        content="old",
        yjs_state=None,
    )
    factory, session = _session_with_section(sec)
    commit = AsyncMock()
    session.commit = commit

    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        path = collab_room_path(pid, sec_id)
        target = CollabRoomTarget(section_id=sec_id, project_id=pid, software_id=None)
        doc = Doc()
        server._pending_markdown_by_room[path] = "new markdown"
        await server._persist_to_db(path, target, doc)
        assert sec.content == "new markdown"
        commit.assert_awaited()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_persist_to_db_skips_when_section_missing() -> None:
    factory = MagicMock()
    session = MagicMock()
    session.get = AsyncMock(return_value=None)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=session)
    cm.__aexit__ = AsyncMock(return_value=None)
    factory.return_value = cm

    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        path = collab_room_path(uuid.uuid4(), uuid.uuid4())
        target = CollabRoomTarget(
            section_id=uuid.uuid4(), project_id=uuid.uuid4(), software_id=None
        )
        await server._persist_to_db(path, target, doc)
        session.commit.assert_not_called()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_persist_to_db_skips_wrong_project() -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=uuid.uuid4(),
        title="T",
        slug="s",
        order=0,
        content="c",
    )
    factory, session = _session_with_section(sec)
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        path = collab_room_path(pid, sec_id)
        target = CollabRoomTarget(section_id=sec_id, project_id=pid, software_id=None)
        await server._persist_to_db(path, target, doc)
        session.commit.assert_not_called()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_persist_to_db_schedules_embedding_when_content_changes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid, sec_id = uuid.uuid4(), uuid.uuid4()
    sec = Section(
        id=sec_id,
        project_id=pid,
        title="T",
        slug="s",
        order=0,
        content="old",
    )
    factory, _ = _session_with_section(sec)
    emb = MagicMock()
    drift = MagicMock()
    monkeypatch.setattr(
        "app.services.embedding_pipeline.schedule_section_embedding",
        emb,
    )
    monkeypatch.setattr(
        "app.services.drift_pipeline.schedule_drift_check",
        drift,
    )

    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        path = collab_room_path(pid, sec_id)
        target = CollabRoomTarget(section_id=sec_id, project_id=pid, software_id=None)
        server._pending_markdown_by_room[path] = "new content"
        await server._persist_to_db(path, target, doc)
        emb.assert_called_once_with(sec_id)
        drift.assert_called_once_with(sec_id)
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_persist_observer_second_change_cancels_pending_task() -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=5.0)
        pid, sec_id = uuid.uuid4(), uuid.uuid4()
        path = collab_room_path(pid, sec_id)
        room = MagicMock()
        room.ydoc = Doc()
        room.ydoc.observe = MagicMock()
        server._attach_persist_observer(room, path)
        handler = room.ydoc.observe.call_args[0][0]
        handler(MagicMock())
        first = server._persist_tasks[path]
        assert not first.done()
        handler(MagicMock())
        await asyncio.sleep(0)
        assert first.cancelled()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_attach_persist_observer_schedules_debounce(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        debounced = AsyncMock()

        async def deb(*a: object, **k: object) -> None:
            await debounced(*a, **k)

        monkeypatch.setattr(server, "_debounced_persist", deb)

        pid, sec_id = uuid.uuid4(), uuid.uuid4()
        path = collab_room_path(pid, sec_id)
        room = MagicMock()
        room.ydoc = Doc()
        room.ydoc.observe = MagicMock()

        server._attach_persist_observer(room, path)
        assert room.ydoc.observe.called
        handler = room.ydoc.observe.call_args[0][0]
        handler(MagicMock())
        t = server._persist_tasks.get(path)
        assert t is not None
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_delete_room_by_room_instance(monkeypatch: pytest.MonkeyPatch) -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        doc = Doc()
        monkeypatch.setattr(server, "_load_doc", AsyncMock(return_value=doc))
        monkeypatch.setattr(srv.WebsocketServer, "start_room", AsyncMock())
        pid, sec_id = uuid.uuid4(), uuid.uuid4()
        path = collab_room_path(pid, sec_id)
        room = await server.get_room(path)
        super_del = AsyncMock()
        monkeypatch.setattr(srv.WebsocketServer, "delete_room", super_del)
        await server.delete_room(room=room)
        super_del.assert_awaited_once_with(name=path, room=None)
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_delete_room_by_room_noop_when_room_not_registered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        super_del = AsyncMock()
        monkeypatch.setattr(srv.WebsocketServer, "delete_room", super_del)
        await server.delete_room(room=MagicMock())
        super_del.assert_not_called()
    finally:
        srv._collab_server = old


@pytest.mark.asyncio
async def test_delete_room_by_name_noop_when_path_not_in_registry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    factory = MagicMock()
    old = srv._collab_server
    srv._collab_server = None
    try:
        server = srv.init_collab_server(factory, debounce_s=0.01)
        super_del = AsyncMock()
        monkeypatch.setattr(srv.WebsocketServer, "delete_room", super_del)
        path = collab_room_path(uuid.uuid4(), uuid.uuid4())
        await server.delete_room(name=path)
        super_del.assert_not_called()
    finally:
        srv._collab_server = old


def _session_with_section(sec: Section) -> tuple[MagicMock, MagicMock]:
    factory = MagicMock()
    session = MagicMock()
    session.get = AsyncMock(return_value=sec)
    session.commit = AsyncMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=session)
    cm.__aexit__ = AsyncMock(return_value=None)
    factory.return_value = cm
    return factory, session
