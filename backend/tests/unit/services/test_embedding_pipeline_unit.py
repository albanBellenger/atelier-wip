"""Unit tests for enqueue embedding helpers (mocked session factory)."""

from __future__ import annotations

import types
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import embedding_pipeline as ep


@pytest.mark.asyncio
async def test_enqueue_artifact_embedding_skips_when_not_configured() -> None:
    aid = uuid.uuid4()
    art = types.SimpleNamespace(
        id=aid,
        embedding_status="pending",
        embedding_error=None,
        extracted_char_count=None,
        chunk_count=None,
        embedded_at=None,
    )
    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=art)
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    with patch.object(ep, "async_session_factory", return_value=mock_cm):
        with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
            m_ec.return_value = False
            await ep.enqueue_artifact_embedding(aid)

    assert art.embedding_status == "skipped"
    mock_session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_enqueue_section_embedding_skips_when_not_configured() -> None:
    mock_session = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    with patch.object(ep, "async_session_factory", return_value=mock_cm):
        with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
            m_ec.return_value = False
            await ep.enqueue_section_embedding(uuid.uuid4())

    mock_session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_run_artifact_embedding_no_row_returns_early() -> None:
    storage = MagicMock()
    storage.get_bytes = AsyncMock()
    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=None)
    aid = uuid.uuid4()
    with patch.object(ep, "get_storage_client", return_value=storage):
        await ep.run_artifact_embedding(mock_session, aid)
    storage.get_bytes.assert_not_called()


@pytest.mark.asyncio
async def test_run_artifact_embedding_inserts_chunks_md() -> None:
    aid = uuid.uuid4()
    row = types.SimpleNamespace(
        file_type="md",
        storage_path="p",
    )
    storage = MagicMock()
    storage.get_bytes = AsyncMock(
        return_value=b"# Title\n\nBody text here for chunking. " * 5
    )
    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=row)
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()
    mock_emb = MagicMock()
    mock_emb.embed_batch = AsyncMock(
        return_value=[[0.1] * 1536] * 2
    )

    with patch.object(ep, "get_storage_client", return_value=storage):
        with patch.object(ep, "EmbeddingService", return_value=mock_emb):
            with patch.object(ep, "chunk_text", return_value=["a", "b"]):
                await ep.run_artifact_embedding(mock_session, aid)

    storage.get_bytes.assert_called_once_with("p")
    assert mock_session.add.call_count == 2
    mock_emb.embed_batch.assert_awaited_once_with(["a", "b"])


@pytest.mark.asyncio
async def test_run_artifact_embedding_empty_chunks_flushes() -> None:
    aid = uuid.uuid4()
    row = types.SimpleNamespace(
        id=aid,
        file_type="md",
        storage_path="p",
        extracted_char_count=None,
        chunk_count=None,
        embedding_status="pending",
        embedded_at=None,
        embedding_error=None,
    )
    storage = MagicMock()
    storage.get_bytes = AsyncMock(return_value=b"x")
    mock_session = MagicMock()
    mock_session.get = AsyncMock(return_value=row)
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_emb = MagicMock()
    mock_emb.embed_batch = AsyncMock()

    with patch.object(ep, "get_storage_client", return_value=storage):
        with patch.object(ep, "chunk_text", return_value=[]):
            with patch.object(ep, "EmbeddingService", return_value=mock_emb):
                await ep.run_artifact_embedding(mock_session, aid)

    mock_emb.embed_batch.assert_not_called()
    mock_session.flush.assert_awaited_once()
    assert row.chunk_count == 0
    assert row.embedding_status == "embedded"
    assert row.extracted_char_count == 1


@pytest.mark.asyncio
async def test_run_section_embedding_no_section() -> None:
    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=None)
    await ep.run_section_embedding(mock_session, uuid.uuid4())
    mock_session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_run_section_embedding_with_chunks() -> None:
    sid = uuid.uuid4()
    sec = types.SimpleNamespace(content="First paragraph.\n\nSecond paragraph here.")
    mock_session = MagicMock()
    mock_session.get = AsyncMock(return_value=sec)
    mock_session.execute = AsyncMock()
    mock_emb = MagicMock()
    mock_emb.embed_batch = AsyncMock(return_value=[[0.1] * 1536])

    with patch.object(ep, "EmbeddingService", return_value=mock_emb):
        with patch.object(ep, "chunk_text", return_value=["only"]):
            await ep.run_section_embedding(mock_session, sid)

    mock_emb.embed_batch.assert_awaited_once_with(["only"])
    mock_session.add.assert_called_once()