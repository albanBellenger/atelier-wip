"""Slice A — GET project includes batched ``status`` on each section (no N+1)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.test_projects import _studio_with_software


@pytest.mark.asyncio
async def test_project_detail_includes_section_status_shape(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]

    for title, body in (
        ("Long enough", "y" * 60),
        ("Short", "nope"),
    ):
        sec = await client.post(
            f"/projects/{pid}/sections",
            json={"title": title, "slug": f"slug-{uuid.uuid4().hex[:6]}"},
        )
        assert sec.status_code == 200, sec.text
        sid = sec.json()["id"]
        patch = await client.patch(
            f"/projects/{pid}/sections/{sid}",
            json={"content": body},
        )
        assert patch.status_code == 200, patch.text

    gr = await client.get(f"/software/{software_id}/projects/{pid}")
    assert gr.status_code == 200, gr.text
    sections = gr.json().get("sections") or []
    assert len(sections) >= 2
    for s in sections:
        assert "status" in s, f"missing status on section: {s!r}"
        assert s["status"] in ("ready", "gaps", "conflict", "empty")
        assert "updated_at" in s and s["updated_at"]


@pytest.mark.asyncio
async def test_project_detail_section_status_not_n_plus_one(
    client: AsyncClient,
    db_engine: AsyncEngine,
) -> None:
    """Many sections: status rollup must not issue one query per section."""
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P-nplus1", "description": None},
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]

    for i in range(12):
        sec = await client.post(
            f"/projects/{pid}/sections",
            json={"title": f"S{i}", "slug": f"s-{sfx}-{i}"},
        )
        assert sec.status_code == 200, sec.text
        sid = sec.json()["id"]
        patch = await client.patch(
            f"/projects/{pid}/sections/{sid}",
            json={"content": "c" * 60},
        )
        assert patch.status_code == 200, patch.text

    sync_engine: Engine = db_engine.sync_engine  # type: ignore[attr-defined]
    statements: list[str] = []

    def _count(
        conn: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        statements.append(statement)

    event.listen(sync_engine, "before_cursor_execute", _count)
    try:
        gr = await client.get(f"/software/{software_id}/projects/{pid}")
        assert gr.status_code == 200, gr.text
        sections = gr.json().get("sections") or []
        assert len(sections) == 12
        for s in sections:
            assert "status" in s
    finally:
        event.remove(sync_engine, "before_cursor_execute", _count)

    # Naive per-section rollup would add dozens of SELECTs; batched implementation stays low.
    assert len(statements) <= 35, f"too many SQL round-trips: {len(statements)}"
