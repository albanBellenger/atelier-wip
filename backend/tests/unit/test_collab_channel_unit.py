"""Unit tests for collab WebSocket channel demux."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.collab.channel import MarkdownSnapshotDemuxChannel


@pytest.mark.asyncio
async def test_markdown_snapshot_demux_consumed_before_binary() -> None:
    calls: list[tuple[str, str]] = []

    def on_snapshot(path: str, content: str) -> None:
        calls.append((path, content))

    inner = MagicMock()
    inner.path = "/ws/projects/p/s/collab"
    seq = [
        json.dumps({"type": "markdown_snapshot", "content": "hi"}).encode(),
        b"\x01\x02",
    ]
    idx = 0

    async def recv() -> bytes:
        nonlocal idx
        b = seq[idx]
        idx += 1
        return b

    inner.recv = recv
    ch = MarkdownSnapshotDemuxChannel(inner, on_snapshot)
    out = await ch.recv()
    assert out == b"\x01\x02"
    assert calls == [("/ws/projects/p/s/collab", "hi")]
