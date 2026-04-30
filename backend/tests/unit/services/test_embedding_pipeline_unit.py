"""Unit tests for enqueue embedding helpers (mocked session factory)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import embedding_pipeline as ep


@pytest.mark.asyncio
async def test_enqueue_artifact_embedding_skips_when_not_configured() -> None:
    mock_session = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    with patch.object(ep, "async_session_factory", return_value=mock_cm):
        with patch.object(ep, "embedding_configured", new_callable=AsyncMock) as m_ec:
            m_ec.return_value = False
            await ep.enqueue_artifact_embedding(uuid.uuid4())

    mock_session.commit.assert_not_called()


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