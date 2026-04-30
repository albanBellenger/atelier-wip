"""LLM regression: work order generation from sections."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_generate_work_orders_returns_201_with_valid_structure(
    client: AsyncClient,
    studio_member: dict[str, object],
    section_with_content: dict[str, object],
) -> None:
    project_id = section_with_content["project_id"]
    section_id = section_with_content["id"]
    headers = studio_member["headers"]
    assert isinstance(headers, dict)

    response = await client.post(
        f"/projects/{project_id}/work-orders/generate",
        json={"section_ids": [str(section_id)]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert isinstance(body, list)
    assert body

    for wo in body:
        assert isinstance(wo["title"], str) and wo["title"]
        assert isinstance(wo["description"], str) and wo["description"]
        assert "acceptance_criteria" in wo
        ac = wo["acceptance_criteria"]
        assert ac is None or isinstance(ac, str)
        assert "implementation_guide" in wo
        ig = wo["implementation_guide"]
        assert ig is None or isinstance(ig, str)
        assert wo["status"] == "backlog"

    keywords = section_with_content["expected_keywords"]
    assert isinstance(keywords, list)
    assert any(
        any(kw in str(wo["title"]).lower() for kw in keywords) for wo in body
    )

    wid = body[0].get("id")
    assert wid is not None
    det = await client.get(
        f"/projects/{project_id}/work-orders/{uuid.UUID(str(wid))}",
        headers=headers,
    )
    assert det.status_code == 200
