"""LLM regression: backlog duplicate analysis."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_dedupe_analyze_returns_shape_with_two_backlog_work_orders(
    client: AsyncClient,
    studio_member: dict[str, object],
    section_with_content: dict[str, object],
) -> None:
    project_id = section_with_content["project_id"]
    section_id = section_with_content["id"]
    headers = studio_member["headers"]
    assert isinstance(headers, dict)

    for label in ("Dedupe LLM task A", "Dedupe LLM task B"):
        r = await client.post(
            f"/projects/{project_id}/work-orders",
            json={
                "title": label,
                "description": (
                    "Implement widget reliability: retries and timeouts for widget ops."
                ),
                "section_ids": [str(section_id)],
            },
            headers=headers,
        )
        assert r.status_code == 200, r.text

    r2 = await client.post(
        f"/projects/{project_id}/work-orders/dedupe/analyze",
        headers=headers,
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert isinstance(data.get("groups"), list)
    for g in data["groups"]:
        assert isinstance(g["rationale"], str) and g["rationale"]
        woids = g["work_order_ids"]
        assert isinstance(woids, list)
        assert len(woids) >= 2
        for x in woids:
            assert isinstance(x, str) and x
        sc = g["suggested_combined"]
        assert isinstance(sc["title"], str) and sc["title"]
        assert isinstance(sc["description"], str) and sc["description"]
        assert "implementation_guide" in sc
        assert "acceptance_criteria" in sc
