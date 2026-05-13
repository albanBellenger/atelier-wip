"""WebSocket channel adapter for pycrdt (Channel protocol)."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable

from anyio import Lock
from fastapi import WebSocket

log = logging.getLogger("atelier.collab.channel")

_MARKDOWN_SNAPSHOT_TYPE = "markdown_snapshot"


def _try_consume_markdown_snapshot_message(
    data: bytes,
    room_path: str,
    on_snapshot: Callable[[str, str], None],
) -> bool:
    """If ``data`` is a JSON ``markdown_snapshot`` frame, handle it and return True."""
    if not data or data[0] != ord("{"):
        return False
    try:
        text = data.decode("utf-8")
        obj = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    if not isinstance(obj, dict) or obj.get("type") != _MARKDOWN_SNAPSHOT_TYPE:
        return False
    content = obj.get("content")
    if not isinstance(content, str):
        log.debug("collab: markdown_snapshot missing string content on %s", room_path)
        return True
    on_snapshot(room_path, content)
    return True


class FastAPIWebSocketChannel:
    """Bytes WebSocket implementing pycrdt Channel."""

    def __init__(self, websocket: WebSocket, path: str) -> None:
        self._ws = websocket
        self._path = path
        self._send_lock = Lock()

    @property
    def path(self) -> str:
        return self._path

    def __aiter__(self) -> FastAPIWebSocketChannel:
        return self

    async def __anext__(self) -> bytes:
        return await self.recv()

    async def send(self, message: bytes) -> None:
        async with self._send_lock:
            await self._ws.send_bytes(message)

    async def recv(self) -> bytes:
        message = await self._ws.receive()
        if message["type"] == "websocket.disconnect":
            raise StopAsyncIteration
        data = message.get("bytes")
        if data is not None:
            return bytes(data)
        text = message.get("text")
        if text is not None:
            return str(text).encode("utf-8")
        return b""


class MarkdownSnapshotDemuxChannel:
    """Wraps a bytes channel: JSON ``markdown_snapshot`` frames never reach pycrdt."""

    def __init__(
        self,
        inner: FastAPIWebSocketChannel,
        on_snapshot: Callable[[str, str], None],
    ) -> None:
        self._inner = inner
        self._on_snapshot = on_snapshot

    @property
    def path(self) -> str:
        return self._inner.path

    async def send(self, message: bytes) -> None:
        await self._inner.send(message)

    async def recv(self) -> bytes:
        while True:
            data = await self._inner.recv()
            if _try_consume_markdown_snapshot_message(
                data, self.path, self._on_snapshot
            ):
                continue
            return data

    def __aiter__(self) -> MarkdownSnapshotDemuxChannel:
        return self

    async def __anext__(self) -> bytes:
        return await self.recv()
