"""LLM regression: section RAG context preview (embeddings + assembly)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_section_context_preview_returns_blocks(
    client: AsyncClient,
    studio_member: dict[str, object],
    section_with_content: dict[str, object],
) -> None:
    project_id = section_with_content["project_id"]
    section_id = section_with_content["id"]
    headers = studio_member["headers"]
    assert isinstance(headers, dict)

    r = await client.get(
        f"/projects/{project_id}/sections/{section_id}/context-preview",
        headers=headers,
        params={"q": "widget reliability retries", "token_budget": 6000},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("blocks"), list)
    assert data["blocks"]
    assert isinstance(data.get("total_tokens"), int)
    assert data["total_tokens"] >= 0
    assert data.get("budget_tokens") == 6000
