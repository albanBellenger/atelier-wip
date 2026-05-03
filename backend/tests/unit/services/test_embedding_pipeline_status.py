"""Phase 1: embedding pipeline updates artifact RAG status fields (unit, mocked DB)."""

from __future__ import annotations

import types
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import embedding_pipeline as ep


@pytest.mark.asyncio
async def test_enqueue_sets_skipped_when_embedding_not_configured() -> None:
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
async def test_run_artifact_embedding_success_sets_embedded_and_counts() -> None:
    aid = uuid.uuid4()
    row = types.SimpleNamespace(
        id=aid,
        file_type="md",
        storage_path="p",
        chunking_strategy=None,
        extracted_char_count=None,
        chunk_count=None,
        embedding_status="pending",
        embedded_at=None,
        embedding_error=None,
    )
    storage = MagicMock()
    storage.get_bytes = AsyncMock(return_value=b"# " + b"x" * 100)
    mock_session = MagicMock()
    mock_session.get = AsyncMock(return_value=row)
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_emb = MagicMock()
    mock_emb.embed_batch = AsyncMock(return_value=[[0.1] * 1536, [0.2] * 1536])

    with patch.object(ep, "get_storage_client", return_value=storage):
        with patch.object(ep, "EmbeddingService", return_value=mock_emb):
            with patch.object(ep, "chunk_artifact_text", return_value=["a", "b"]):
                await ep.run_artifact_embedding(mock_session, aid)

    assert row.extracted_char_count == 102
    assert row.chunk_count == 2
    assert row.embedding_status == "embedded"
    assert row.embedding_error is None
    assert row.embedded_at is not None
    assert mock_session.add.call_count == 2


@pytest.mark.asyncio
async def test_run_artifact_embedding_empty_text_still_embedded_zero_chunks() -> None:
    aid = uuid.uuid4()
    row = types.SimpleNamespace(
        id=aid,
        file_type="md",
        storage_path="p",
        chunking_strategy=None,
        extracted_char_count=None,
        chunk_count=None,
        embedding_status="pending",
        embedded_at=None,
        embedding_error=None,
    )
    storage = MagicMock()
    storage.get_bytes = AsyncMock(return_value=b"   \n\t  ")
    mock_session = MagicMock()
    mock_session.get = AsyncMock(return_value=row)
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_emb = MagicMock()
    mock_emb.embed_batch = AsyncMock()

    with patch.object(ep, "get_storage_client", return_value=storage):
        with patch.object(ep, "EmbeddingService", return_value=mock_emb):
            with patch.object(ep, "chunk_artifact_text", return_value=[]):
                await ep.run_artifact_embedding(mock_session, aid)

    mock_emb.embed_batch.assert_not_called()
    assert row.extracted_char_count == 0
    assert row.chunk_count == 0
    assert row.embedding_status == "embedded"
    assert row.embedded_at is not None


@pytest.mark.asyncio
async def test_enqueue_failure_marks_failed_with_truncated_error() -> None:
    aid = uuid.uuid4()

    class Boom(Exception):
        def __str__(self) -> str:
            return "x" * 600

    mock_inner = AsyncMock()
    mock_inner.rollback = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_inner)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    recovery = AsyncMock()
    recovery_cm = MagicMock()
    recovery_cm.__aenter__ = AsyncMock(return_value=recovery)
    recovery_cm.__aexit__ = AsyncMock(return_value=None)
    art = types.SimpleNamespace(
        id=aid,
        embedding_status="pending",
        embedding_error=None,
    )
    recovery.get = AsyncMock(return_value=art)

    factories = iter([mock_cm, recovery_cm])

    def _factory() -> object:
        return next(factories)

    with patch.object(ep, "async_session_factory", side_effect=_factory):
        with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
            m_ec.return_value = True
            with patch.object(ep, "run_artifact_embedding", AsyncMock(side_effect=Boom())):
                await ep.enqueue_artifact_embedding(aid)

    assert art.embedding_status == "failed"
    assert art.embedding_error is not None
    assert len(art.embedding_error) == 500


@pytest.mark.asyncio
async def test_persist_failure_swallows_inner_errors() -> None:
    aid = uuid.uuid4()

    bad_cm = MagicMock()
    bad_cm.__aenter__ = AsyncMock(side_effect=RuntimeError("db down"))
    bad_cm.__aexit__ = AsyncMock(return_value=None)

    with patch.object(ep, "async_session_factory", return_value=bad_cm):
        await ep._persist_artifact_embedding_failure(aid, "oops")


@pytest.mark.asyncio
async def test_embed_in_upload_session_skips_when_not_configured() -> None:
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
    with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
        m_ec.return_value = False
        await ep.embed_artifact_in_upload_session(mock_session, aid)
    assert art.embedding_status == "skipped"
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_embed_in_upload_session_runs_embedding_in_savepoint() -> None:
    from contextlib import asynccontextmanager

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

    @asynccontextmanager
    async def _nested() -> None:
        yield None

    mock_session.begin_nested = MagicMock(return_value=_nested())
    with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
        m_ec.return_value = True
        with patch.object(ep, "run_artifact_embedding", new_callable=AsyncMock) as m_run:
            await ep.embed_artifact_in_upload_session(mock_session, aid)
    m_run.assert_awaited_once_with(mock_session, aid)
    mock_session.begin_nested.assert_called_once()


@pytest.mark.asyncio
async def test_embed_in_upload_session_marks_failed_on_run_error() -> None:
    from contextlib import asynccontextmanager

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

    @asynccontextmanager
    async def _nested() -> None:
        yield None

    mock_session.begin_nested = MagicMock(return_value=_nested())
    with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
        m_ec.return_value = True
        with patch.object(
            ep,
            "run_artifact_embedding",
            new_callable=AsyncMock,
            side_effect=RuntimeError("embed failed"),
        ):
            await ep.embed_artifact_in_upload_session(mock_session, aid)
    mock_session.refresh.assert_awaited_once_with(art)
    assert art.embedding_status == "failed"
    assert art.embedding_error == "embed failed"
    mock_session.flush.assert_awaited()
