"""LLM regression: manual conflict analysis → issues."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_analyze_creates_issues_with_expected_shape(
    client: AsyncClient,
    project_with_contradictory_sections: dict[str, object],
) -> None:
    project_id = project_with_contradictory_sections["project_id"]
    headers = project_with_contradictory_sections["headers"]
    assert isinstance(headers, dict)

    analyze = await client.post(
        f"/projects/{project_id}/analyze",
        headers=headers,
    )
    assert analyze.status_code == 200, analyze.text
    payload = analyze.json()
    assert "issues_created" in payload
    assert int(payload["issues_created"]) >= 1

    issues_r = await client.get(
        f"/projects/{project_id}/issues",
        headers=headers,
    )
    assert issues_r.status_code == 200, issues_r.text
    data = issues_r.json()
    assert isinstance(data, list)
    assert data

    open_issues = [i for i in data if i.get("status") == "open"]
    assert open_issues
    chosen = open_issues[0]
    assert isinstance(chosen["description"], str) and chosen["description"]
    assert chosen["status"] == "open"
    assert chosen["origin"] == "manual"

    any_pair = any(
        isinstance(i.get("section_b_id"), str) and i.get("section_b_id")
        for i in open_issues
    )
    assert any_pair, "expected at least one pair-linked issue for contradictory sections"
