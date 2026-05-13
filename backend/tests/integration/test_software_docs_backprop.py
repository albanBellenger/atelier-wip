"""Software Docs backprop API — RBAC, 409, 404, 422."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseFile, CodebaseSnapshot, CrossStudioAccess, Section, Software
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
    r = await client.post(
        "/auth/login",
        json={"email": email, "password": _PW},
    )
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


async def _fake_chat_structured(_self: object, **kwargs: object) -> dict[str, object]:
    cs = kwargs.get("call_source")
    if cs == "backprop_outline":
        return {"sections": [{"title": "One", "slug": "one", "summary": "S"}]}
    return {"markdown": "# Hi", "source_files": ["x.py"]}


@pytest.mark.asyncio
async def test_propose_outline_happy_path_and_409(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"o-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"St{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SW", definition="Def")
    await db_session.commit()

    monkeypatch.setattr(
        "app.services.codebase_service.LLMService.chat_structured",
        _fake_chat_structured,
    )

    await _login(client, owner.email)

    r409 = await client.post(
        f"/software/{sw.id}/docs/propose-outline",
        json={"hint": "x"},
    )
    assert r409.status_code == 409
    assert r409.json().get("code") == "CODEBASE_NOT_INDEXED"

    snap = _ready_snapshot(sw)
    db_session.add(snap)
    await db_session.flush()
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="src/x.py",
            blob_sha="b" * 40,
            size_bytes=10,
        )
    )
    await db_session.commit()

    rok = await client.post(
        f"/software/{sw.id}/docs/propose-outline",
        json={"hint": "api"},
    )
    assert rok.status_code == 200, rok.text
    body = rok.json()
    assert isinstance(body.get("sections"), list)
    assert body["sections"][0]["slug"] == "one"


@pytest.mark.asyncio
async def test_propose_outline_rbac_and_404(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.codebase_service.LLMService.chat_structured",
        _fake_chat_structured,
    )
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"o2-{sfx}@example.com", password=_PW)
    member = await create_user(db_session, email=f"m2-{sfx}@example.com", password=_PW)
    viewer = await create_user(db_session, email=f"v2-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"S2{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, member.id, role="studio_member")
    await add_studio_member(db_session, studio.id, viewer.id, role="studio_viewer")
    sw = await create_software(db_session, studio.id, name="SW2")
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

    na = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert na.status_code == 401

    await _login(client, viewer.email)
    viewer_forbidden = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert viewer_forbidden.status_code == 403

    await _login(client, member.email)
    member_forbidden = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert member_forbidden.status_code == 403

    await _login(client, owner.email)
    owner_ok = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert owner_ok.status_code == 200, owner_ok.text

    nf = await client.post(f"/software/{uuid.uuid4()}/docs/propose-outline", json={})
    assert nf.status_code == 404

    bad = await client.post("/software/not-uuid/docs/propose-outline", json={})
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_propose_outline_cross_studio_external_editor_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.codebase_service.LLMService.chat_structured",
        _fake_chat_structured,
    )
    sfx = uuid.uuid4().hex[:8]
    owner_a = await create_user(db_session, email=f"ox-{sfx}@example.com", password=_PW)
    editor_b = await create_user(db_session, email=f"ex-{sfx}@example.com", password=_PW)
    st_a = await create_studio(db_session, name=f"SXA{sfx}")
    st_b = await create_studio(db_session, name=f"SXB{sfx}")
    await add_studio_member(db_session, st_a.id, owner_a.id, role="studio_admin")
    await add_studio_member(db_session, st_b.id, editor_b.id, role="studio_member")
    sw = await create_software(db_session, st_a.id, name="SharedOutline")
    snap = _ready_snapshot(sw)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="x.py",
            blob_sha="e" * 40,
            size_bytes=1,
        )
    )
    grant = CrossStudioAccess(
        id=uuid.uuid4(),
        requesting_studio_id=st_b.id,
        target_software_id=sw.id,
        requested_by=editor_b.id,
        approved_by=owner_a.id,
        access_level="external_editor",
        status="approved",
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(grant)
    await db_session.commit()

    await _login(client, editor_b.email)
    forbidden = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_propose_outline_hint_too_long_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"hl-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"HL{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="HL")
    await db_session.commit()
    await _login(client, owner.email)
    r = await client.post(
        f"/software/{sw.id}/docs/propose-outline",
        json={"hint": "x" * 4001},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_propose_draft_happy_cross_studio_forbidden_wrong_section(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.codebase_service.LLMService.chat_structured",
        _fake_chat_structured,
    )
    sfx = uuid.uuid4().hex[:8]
    owner_a = await create_user(db_session, email=f"oa-{sfx}@example.com", password=_PW)
    owner_b = await create_user(db_session, email=f"ob-{sfx}@example.com", password=_PW)
    editor_b = await create_user(db_session, email=f"eb-{sfx}@example.com", password=_PW)
    st_a = await create_studio(db_session, name=f"A{sfx}")
    st_b = await create_studio(db_session, name=f"B{sfx}")
    await add_studio_member(db_session, st_a.id, owner_a.id, role="studio_admin")
    await add_studio_member(db_session, st_b.id, owner_b.id, role="studio_admin")
    await add_studio_member(db_session, st_b.id, editor_b.id, role="studio_member")
    sw = await create_software(db_session, st_a.id, name="SharedSW")
    sec = Section(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        title="Doc",
        slug="doc",
        order=0,
        content="Body",
    )
    db_session.add(sec)
    snap = _ready_snapshot(sw)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="z.py",
            blob_sha="d" * 40,
            size_bytes=1,
        )
    )
    grant = CrossStudioAccess(
        id=uuid.uuid4(),
        requesting_studio_id=st_b.id,
        target_software_id=sw.id,
        requested_by=owner_b.id,
        approved_by=owner_a.id,
        access_level="external_editor",
        status="approved",
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(grant)
    await db_session.flush()
    await db_session.commit()

    await _login(client, editor_b.email)
    xdraft = await client.post(f"/software/{sw.id}/docs/{sec.id}/propose-draft")
    assert xdraft.status_code == 403

    await _login(client, owner_a.email)
    ok = await client.post(f"/software/{sw.id}/docs/{sec.id}/propose-draft")
    assert ok.status_code == 200, ok.text
    assert isinstance(ok.json().get("markdown"), str)

    missing_sec = await client.post(
        f"/software/{sw.id}/docs/{uuid.uuid4()}/propose-draft",
    )
    assert missing_sec.status_code == 404

    wrong_sw = await create_software(db_session, st_a.id, name="Other")
    await db_session.commit()
    await _login(client, owner_a.email)
    wrong = await client.post(f"/software/{wrong_sw.id}/docs/{sec.id}/propose-draft")
    assert wrong.status_code == 404


@pytest.mark.asyncio
async def test_propose_draft_409_without_snapshot(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"o3-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"S3{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="NoSnap")
    sec = Section(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        title="X",
        slug="x",
        order=0,
        content="",
    )
    db_session.add(sec)
    await db_session.flush()
    await db_session.commit()

    await _login(client, owner.email)
    r = await client.post(f"/software/{sw.id}/docs/{sec.id}/propose-draft")
    assert r.status_code == 409
    assert r.json().get("code") == "CODEBASE_NOT_INDEXED"


@pytest.mark.asyncio
async def test_propose_draft_unauthenticated_401(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"u4-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"S4{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="U4")
    sec = Section(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        title="T",
        slug="t",
        order=0,
        content="",
    )
    db_session.add(sec)
    await db_session.commit()
    client.cookies.clear()
    r = await client.post(f"/software/{sw.id}/docs/{sec.id}/propose-draft")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_propose_draft_invalid_path_422(client: AsyncClient) -> None:
    r = await client.post(
        "/software/not-a-uuid/docs/00000000-0000-0000-0000-000000000001/propose-draft",
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_propose_draft_project_section_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.codebase_service.LLMService.chat_structured",
        _fake_chat_structured,
    )
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ps-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"PS{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="PSW")
    proj = await create_project(db_session, sw.id, name="P1")
    psec = await create_section(db_session, proj.id, title="ProjSec", slug="ps", order=0)
    snap = _ready_snapshot(sw)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="p.py",
            blob_sha="f" * 40,
            size_bytes=1,
        )
    )
    await db_session.commit()
    await _login(client, owner.email)
    r = await client.post(f"/software/{sw.id}/docs/{psec.id}/propose-draft")
    assert r.status_code == 404
