"""WebSocket channel adapter for pycrdt (Channel protocol)."""

from __future__ import annotations

from anyio import Lock
from fastapi import WebSocket


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
