"""Unit tests for CitationHealthService."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.citation_health_service import CitationHealthService


@pytest.mark.asyncio
async def test_analyze_section_empty_returns_zeros() -> None:
    db = AsyncMock()
    sec = MagicMock()
    sec.project_id = uuid.uuid4()
    sec.content = ""
    sec.yjs_state = None
    db.get = AsyncMock(return_value=sec)

    out = await CitationHealthService(db).analyze_section(
        project_id=sec.project_id,
        section_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    assert out.citations_resolved == 0
    assert out.citations_missing == 0
    assert out.missing_items == []
