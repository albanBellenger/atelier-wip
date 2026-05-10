"""LLM regression: project graph section-relationship scan."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_graph_analyze_sections_completes_after_llm(
    client: AsyncClient,
    project_two_sections_for_graph_llm: dict[str, object],
) -> None:
    project_id = project_two_sections_for_graph_llm["project_id"]
    headers = project_two_sections_for_graph_llm["headers"]
    assert isinstance(headers, dict)

    r = await client.post(
        f"/projects/{project_id}/graph/analyze-sections",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("message"), str) and data["message"]
