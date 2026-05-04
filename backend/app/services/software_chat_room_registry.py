"""In-memory software chat rooms (single uvicorn worker)."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any
from uuid import UUID

from starlette.websockets import WebSocket

_lock = asyncio.Lock()
_rooms: dict[UUID, set[WebSocket]] = defaultdict(set)


async def register(software_id: UUID, ws: WebSocket) -> None:
    async with _lock:
        _rooms[software_id].add(ws)


async def unregister(software_id: UUID, ws: WebSocket) -> None:
    async with _lock:
        room = _rooms.get(software_id)
        if not room:
            return
        room.discard(ws)
        if not room:
            del _rooms[software_id]


async def broadcast_json(software_id: UUID, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, default=str)
    async with _lock:
        peers = list(_rooms.get(software_id, ()))
    dead: list[WebSocket] = []
    for ws in peers:
        try:
            await ws.send_text(raw)
        except Exception:
            dead.append(ws)
    if dead:
        async with _lock:
            room = _rooms.get(software_id)
            if room:
                for ws in dead:
                    room.discard(ws)
