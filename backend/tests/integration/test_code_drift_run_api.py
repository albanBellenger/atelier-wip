"""Integration: POST /software/{id}/codebase/code-drift/run (Slice 16e)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseFile, CodebaseSnapshot, CrossStudioAccess, Issue, Software
from tests.factories import (
    add_studio_member,
    create_project,
    create_section,
    create_software,
    create_studio,
    create_user,
)

_PW = "securepass123"


async def _login(client: AsyncClient, email: str) -> None:
    client.cookies.clear()
    r = await client.post("/auth/login", json={"email": email, "password": _PW})
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    client.cookies.set("atelier_token", str(token))


def _ready_snapshot(sw: Software) -> CodebaseSnapshot:
    return CodebaseSnapshot(
        id=uuid.uuid4(),
        software_id=sw.id,
        commit_sha="a" * 40,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_code_drift_not_indexed_returns_200_with_skip(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"cd-skip-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"CDS{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SW")
    await db_session.commit()
    await _login(client, owner.email)
    r = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("skipped_reason") == "not_indexed"
    assert body.get("sections_evaluated") == 0


@pytest.mark.asyncio
async def test_code_drift_rbac_cross_studio_and_auth(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"cd-rb-{sfx}@example.com", password=_PW)
    viewer = await create_user(db_session, email=f"cd-v-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"CDR{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, viewer.id, role="studio_viewer")
    sw = await create_software(db_session, studio.id, name="SWRB")
    snap = _ready_snapshot(sw)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="x.py",
            blob_sha="b" * 40,
            size_bytes=1,
        )
    )
    await db_session.commit()

    na = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert na.status_code == 401

    await _login(client, viewer.email)
    vf = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert vf.status_code == 403

    ext = await create_user(db_session, email=f"cd-ext-{sfx}@example.com", password=_PW)
    st_b = await create_studio(db_session, name=f"CDB{sfx}")
    await add_studio_member(db_session, st_b.id, ext.id, role="studio_member")
    grant = CrossStudioAccess(
        id=uuid.uuid4(),
        requesting_studio_id=st_b.id,
        target_software_id=sw.id,
        requested_by=ext.id,
        approved_by=owner.id,
        access_level="external_editor",
        status="approved",
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(grant)
    await db_session.commit()
    await _login(client, ext.email)
    xf = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert xf.status_code == 403

    await _login(client, owner.email)
    ok = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert ok.status_code == 200, ok.text


@pytest.mark.asyncio
async def test_code_drift_member_can_run(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"cd-o-{sfx}@example.com", password=_PW)
    member = await create_user(db_session, email=f"cd-m-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"CDM{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, member.id, role="studio_member")
    sw = await create_software(db_session, studio.id, name="SWM")
    proj = await create_project(db_session, sw.id, name="P1")
    await create_section(db_session, proj.id, title="Sec", slug="s", order=0)
    snap = _ready_snapshot(sw)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="a.py",
            blob_sha="c" * 40,
            size_bytes=1,
        )
    )
    await db_session.commit()

    async def fake_sec(*_a: object, **_k: object) -> dict[str, object]:
        return {
            "likely_drifted": False,
            "severity": "low",
            "reason": "ok",
            "code_refs": [],
        }

    async def fake_wo(*_a: object, **_k: object) -> dict[str, object]:
        return {"verdict": "complete", "reason": "ok", "code_refs": []}

    monkeypatch.setattr(
        "app.services.code_drift_service.CodeDriftSectionAgent.analyse",
        fake_sec,
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.CodeDriftWorkOrderAgent.analyse",
        fake_wo,
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.CodebaseRagService.retrieve_chunks_for_text",
        AsyncMock(
            return_value=[{"path": "a.py", "snippet": "z", "start_line": 1, "end_line": 2, "score": 0.1}]
        ),
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.LLMService.ensure_openai_llm_ready",
        AsyncMock(return_value=None),
    )

    await _login(client, member.email)
    r = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert r.status_code == 200, r.text
    assert r.json().get("sections_evaluated") == 1
    assert r.json().get("sections_flagged") == 0


@pytest.mark.asyncio
async def test_code_drift_second_run_clears_only_drift_kinds_preserves_conflict(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"cd-cl-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"CDC{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SWCL")
    proj = await create_project(db_session, sw.id, name="PCL")
    sec = await create_section(db_session, proj.id, title="S", slug="s", order=0)
    snap = _ready_snapshot(sw)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="p.py",
            blob_sha="d" * 40,
            size_bytes=1,
        )
    )
    drift_old = Issue(
        id=uuid.uuid4(),
        project_id=proj.id,
        software_id=sw.id,
        kind="code_drift_section",
        section_a_id=sec.id,
        section_b_id=None,
        description="old",
        status="open",
        origin="auto",
        run_actor_id=owner.id,
        payload_json={"severity": "low", "code_refs": []},
    )
    gap = Issue(
        id=uuid.uuid4(),
        project_id=proj.id,
        software_id=sw.id,
        kind="conflict_or_gap",
        section_a_id=sec.id,
        section_b_id=None,
        description="gap",
        status="open",
        origin="auto",
        run_actor_id=owner.id,
    )
    db_session.add(drift_old)
    db_session.add(gap)
    await db_session.commit()

    calls = {"n": 0}

    async def fake_sec(*_a: object, **_k: object) -> dict[str, object]:
        calls["n"] += 1
        return {
            "likely_drifted": calls["n"] == 1,
            "severity": "high",
            "reason": "Drift on first run only.",
            "code_refs": [{"path": "p.py", "start_line": 1, "end_line": 2}],
        }

    async def fake_wo(*_a: object, **_k: object) -> dict[str, object]:
        return {"verdict": "complete", "reason": "ok", "code_refs": []}

    monkeypatch.setattr(
        "app.services.code_drift_service.CodeDriftSectionAgent.analyse",
        fake_sec,
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.CodeDriftWorkOrderAgent.analyse",
        fake_wo,
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.CodebaseRagService.retrieve_chunks_for_text",
        AsyncMock(
            return_value=[{"path": "p.py", "snippet": "x", "start_line": 1, "end_line": 2, "score": 0.1}]
        ),
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.LLMService.ensure_openai_llm_ready",
        AsyncMock(return_value=None),
    )

    await _login(client, owner.email)
    r1 = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert r1.status_code == 200
    assert r1.json().get("sections_flagged") == 1
    lst1 = (await client.get(f"/projects/{proj.id}/issues")).json()
    kinds1 = {x["kind"] for x in lst1}
    assert "code_drift_section" in kinds1
    assert "conflict_or_gap" in kinds1

    r2 = await client.post(f"/software/{sw.id}/codebase/code-drift/run")
    assert r2.status_code == 200
    assert r2.json().get("sections_flagged") == 0
    lst2 = (await client.get(f"/projects/{proj.id}/issues")).json()
    kinds2 = {x["kind"] for x in lst2}
    assert "code_drift_section" not in kinds2
    assert "conflict_or_gap" in kinds2


@pytest.mark.asyncio
async def test_code_drift_invalid_software_404(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"cd-404-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"CD4{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await create_software(db_session, studio.id, name="X")
    await db_session.commit()
    await _login(client, owner.email)
    r = await client.post(f"/software/{uuid.uuid4()}/codebase/code-drift/run")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_code_drift_malformed_software_id_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"cd-bad-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"CDBAD{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await create_software(db_session, studio.id, name="SwBad")
    await db_session.commit()
    await _login(client, owner.email)
    bad = await client.post("/software/not-a-uuid/codebase/code-drift/run")
    assert bad.status_code == 422
