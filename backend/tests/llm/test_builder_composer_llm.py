"""LLM regression: builder home composer hint (structured)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_builder_composer_hint_returns_structured_copy(
    client: AsyncClient,
    studio_member_software_project: dict[str, object],
) -> None:
    software_id = studio_member_software_project["software_id"]
    project_id = studio_member_software_project["project_id"]
    headers = studio_member_software_project["headers"]
    assert isinstance(headers, dict)

    r = await client.post(
        "/me/builder-composer-hint",
        headers=headers,
        json={
            "software_id": str(software_id),
            "project_id": str(project_id),
            "local_hour": 14,
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("headline"), str) and data["headline"].strip()
    assert isinstance(data.get("input_placeholder"), str) and data[
        "input_placeholder"
    ].strip()
