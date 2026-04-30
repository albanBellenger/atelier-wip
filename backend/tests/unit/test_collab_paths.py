"""Unit tests for collab path parsing and disconnect classification."""

import asyncio
import logging

import pytest
from starlette.websockets import WebSocketDisconnect

from app.collab.server import (
    collab_exception_handler,
    collab_room_path,
    get_collab_server,
    init_collab_server,
    parse_collab_path,
    _is_client_disconnect,
)


def test_collab_room_path_and_parse_roundtrip() -> None:
    from uuid import uuid4

    pid, sid = uuid4(), uuid4()
    path = collab_room_path(pid, sid)
    p2, s2 = parse_collab_path(path)
    assert p2 == pid and s2 == sid


def test_parse_collab_path_invalid() -> None:
    with pytest.raises(ValueError, match="invalid collab path"):
        parse_collab_path("/wrong/path")


def test_parse_collab_path_rejects_trailing_slash_or_query() -> None:
    from uuid import uuid4

    pid, sid = uuid4(), uuid4()
    base = collab_room_path(pid, sid)
    with pytest.raises(ValueError, match="invalid collab path"):
        parse_collab_path(base + "/")
    with pytest.raises(ValueError, match="invalid collab path"):
        parse_collab_path(base + "?x=1")


def test_get_collab_server_before_init_raises() -> None:
    import app.collab.server as srv

    old = srv._collab_server
    srv._collab_server = None
    try:
        with pytest.raises(RuntimeError, match="not initialized"):
            get_collab_server()
    finally:
        srv._collab_server = old


def test_is_client_disconnect_starlette() -> None:
    assert _is_client_disconnect(WebSocketDisconnect())


def test_is_client_disconnect_os_error_codes() -> None:
    e = OSError()
    e.errno = 104
    assert _is_client_disconnect(e)


def test_is_client_disconnect_connection_closed() -> None:
    class ConnectionClosedError(Exception):
        pass

    assert _is_client_disconnect(ConnectionClosedError())


def test_is_client_disconnect_exception_group() -> None:
    inner = WebSocketDisconnect()
    eg = ExceptionGroup("x", (inner,))
    assert _is_client_disconnect(eg)


def test_collab_exception_handler_disconnect_is_true() -> None:
    lg = logging.getLogger("test.collab")
    assert collab_exception_handler(WebSocketDisconnect(), lg) is True


def test_collab_exception_handler_delegates_to_pycrdt() -> None:
    from unittest.mock import patch

    lg = logging.getLogger("test.collab")
    with patch("app.collab.server.exception_logger", return_value=False) as p:
        out = collab_exception_handler(ValueError("x"), lg)
    assert out is False
    p.assert_called_once()


def test_init_collab_server_sets_singleton() -> None:
    import app.collab.server as srv

    from unittest.mock import MagicMock

    factory = MagicMock()
    old = srv._collab_server
    try:
        srv._collab_server = None
        s = init_collab_server(factory, debounce_s=0.01)
        assert srv._collab_server is s
        assert get_collab_server() is s
    finally:
        srv._collab_server = old
