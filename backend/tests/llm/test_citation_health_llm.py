"""LLM regression: section citation health (structured)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_citation_health_flags_uncited_normative_claims(
    client: AsyncClient,
    studio_member: dict[str, object],
    section_with_content: dict[str, object],
) -> None:
    """Fixture section is descriptive; expect at least one traceability gap or missing item."""
    project_id = section_with_content["project_id"]
    section_id = section_with_content["id"]
    headers = studio_member["headers"]
    assert isinstance(headers, dict)

    r = await client.get(
        f"/projects/{project_id}/sections/{section_id}/citation-health",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("citations_resolved"), int)
    assert isinstance(data.get("citations_missing"), int)
    assert data["citations_resolved"] >= 0
    assert data["citations_missing"] >= 0
    items = data.get("missing_items")
    assert isinstance(items, list)
    for it in items:
        assert isinstance(it.get("statement"), str) and it["statement"].strip()

    keywords = ("widget", "reliability", "retry", "metric", "network")
    mentions_fixture = any(
        any(kw in it["statement"].lower() for kw in keywords) for it in items
    )
    assert data["citations_missing"] >= 1 or mentions_fixture, (
        "expected uncited spec claims to surface in counts or missing_items"
    )


async def test_citation_health_empty_section_returns_zeros(
    client: AsyncClient,
    empty_section_citation_ctx: dict[str, object],
) -> None:
    """No plaintext → service returns before LLM (short-circuit path)."""
    project_id = empty_section_citation_ctx["project_id"]
    section_id = empty_section_citation_ctx["section_id"]
    headers = empty_section_citation_ctx["headers"]
    assert isinstance(headers, dict)

    r = await client.get(
        f"/projects/{project_id}/sections/{section_id}/citation-health",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["citations_resolved"] == 0
    assert data["citations_missing"] == 0
    assert data["missing_items"] == []

