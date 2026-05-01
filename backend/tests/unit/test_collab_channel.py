"""Unit tests for FastAPIWebSocketChannel (pycrdt Channel adapter)."""

from unittest.mock import AsyncMock

import pytest

from app.collab.channel import FastAPIWebSocketChannel


@pytest.mark.asyncio
async def test_channel_path_and_iter_self() -> None:
    ws = AsyncMock()
    path = "/ws/projects/x/sections/y/collab"
    ch = FastAPIWebSocketChannel(ws, path)
    assert ch.path == path
    assert ch.__aiter__() is ch


@pytest.mark.asyncio
async def test_send_uses_send_bytes() -> None:
    ws = AsyncMock()
    ws.send_bytes = AsyncMock()
    ch = FastAPIWebSocketChannel(ws, "/p")
    await ch.send(b"\x01\x02")
    ws.send_bytes.assert_awaited_once_with(b"\x01\x02")


@pytest.mark.asyncio
async def test_recv_returns_bytes_payload() -> None:
    ws = AsyncMock()
    ws.receive = AsyncMock(
        return_value={"type": "websocket.receive", "bytes": b"plain"}
    )
    ch = FastAPIWebSocketChannel(ws, "/p")
    assert await ch.recv() == b"plain"


@pytest.mark.asyncio
async def test_recv_encodes_text_payload() -> None:
    ws = AsyncMock()
    ws.receive = AsyncMock(
        return_value={"type": "websocket.receive", "text": "café"}
    )
    ch = FastAPIWebSocketChannel(ws, "/p")
    assert await ch.recv() == "café".encode("utf-8")


@pytest.mark.asyncio
async def test_recv_empty_when_no_bytes_or_text() -> None:
    ws = AsyncMock()
    ws.receive = AsyncMock(return_value={"type": "websocket.receive"})
    ch = FastAPIWebSocketChannel(ws, "/p")
    assert await ch.recv() == b""


@pytest.mark.asyncio
async def test_recv_disconnect_raises_stop_iteration() -> None:
    ws = AsyncMock()
    ws.receive = AsyncMock(return_value={"type": "websocket.disconnect"})
    ch = FastAPIWebSocketChannel(ws, "/p")
    with pytest.raises(StopAsyncIteration):
        await ch.recv()


@pytest.mark.asyncio
async def test_anext_delegates_to_recv() -> None:
    ws = AsyncMock()
    ws.receive = AsyncMock(
        return_value={"type": "websocket.receive", "bytes": b"z"}
    )
    ch = FastAPIWebSocketChannel(ws, "/p")
    assert await ch.__anext__() == b"z"

