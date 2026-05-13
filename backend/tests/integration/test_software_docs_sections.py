"""Software-wide documentation sections API."""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CrossStudioAccess
from tests.factories import (
    add_studio_member,
    create_software,
    create_studio,
    create_user,
)
from tests.integration.studio_http_seed import post_admin_studio

_PW = "securepass123"


async def _login_email(client: AsyncClient, email: str) -> None:
    client.cookies.clear()
    r = await client.post(
        "/auth/login",
        json={"email": email, "password": _PW},
    )
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    client.cookies.set("atelier_token", str(token))


async def _register_return_token(client: AsyncClient, suffix: str, label: str) -> str:
    client.cookies.clear()
    r = await client.post(
        "/auth/register",
        json={
            "email": f"{label}-{suffix}@example.com",
            "password": "securepass123",
            "display_name": label,
        },
    )
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    return str(token)


@pytest.mark.asyncio
async def test_software_docs_sections_rbac_and_crud(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register_return_token(client, sfx, "owner")
    cr = await post_admin_studio(
        client,
        db_session,
        user_email=f"owner-{sfx}@example.com",
        json_body={"name": f"S{sfx}", "description": "d"},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]

    client.cookies.clear()
    na = await client.get(f"/software/{software_id}/docs")
    assert na.status_code == 401

    client.cookies.set("atelier_token", token_owner)
    empty = await client.get(f"/software/{software_id}/docs")
    assert empty.status_code == 200
    assert empty.json() == []

    token_member = await _register_return_token(client, sfx, "member")

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )

    client.cookies.clear()
    client.cookies.set("atelier_token", token_member)
    forbidden_create = await client.post(
        f"/software/{software_id}/docs",
        json={"title": "Shared README"},
    )
    assert forbidden_create.status_code == 403

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    ok = await client.post(
        f"/software/{software_id}/docs",
        json={"title": "Shared README"},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    sec_id = body["id"]
    assert body["slug"] == "shared-readme"
    assert body["software_id"] == software_id
    assert body["project_id"] is None

    with_body = await client.post(
        f"/software/{software_id}/docs",
        json={
            "title": "Architecture notes",
            "slug": "architecture",
            "content": "## Overview\n\nInitial draft from API.",
        },
    )
    assert with_body.status_code == 200, with_body.text
    assert "## Overview" in (with_body.json().get("content") or "")

    client.cookies.clear()
    client.cookies.set("atelier_token", token_member)
    lst = await client.get(f"/software/{software_id}/docs")
    assert lst.status_code == 200
    assert len(lst.json()) == 2
    slugs = {row["slug"] for row in lst.json()}
    assert "shared-readme" in slugs and "architecture" in slugs

    one = await client.get(f"/software/{software_id}/docs/{sec_id}")
    assert one.status_code == 200

    patch_content = await client.patch(
        f"/software/{software_id}/docs/{sec_id}",
        json={"content": "## Hello"},
    )
    assert patch_content.status_code == 200, patch_content.text
    assert "## Hello" in (patch_content.json().get("content") or "")

    wrong = await client.get(f"/software/{uuid.uuid4()}/docs/{sec_id}")
    assert wrong.status_code == 404


@pytest.mark.asyncio
async def test_propose_outline_studio_builder_forbidden_403(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST .../propose-outline requires Studio Owner (``require_software_admin``)."""
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"own-b-{sfx}@example.com", password=_PW)
    builder = await create_user(db_session, email=f"bld-b-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"SB{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, builder.id, role="studio_member")
    sw = await create_software(db_session, studio.id, name="SWB")
    await db_session.commit()

    await _login_email(client, builder.email)
    r = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_propose_outline_cross_studio_external_forbidden_403(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_a = await create_user(db_session, email=f"oa-x-{sfx}@example.com", password=_PW)
    editor_b = await create_user(db_session, email=f"eb-x-{sfx}@example.com", password=_PW)
    st_a = await create_studio(db_session, name=f"XA{sfx}")
    st_b = await create_studio(db_session, name=f"XB{sfx}")
    await add_studio_member(db_session, st_a.id, owner_a.id, role="studio_admin")
    await add_studio_member(db_session, st_b.id, editor_b.id, role="studio_member")
    sw = await create_software(db_session, st_a.id, name="SWX")
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

    await _login_email(client, editor_b.email)
    r = await client.post(f"/software/{sw.id}/docs/propose-outline", json={})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_propose_outline_studio_owner_succeeds_200(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.models import CodebaseFile, CodebaseSnapshot

    async def _fake_chat_structured(_self: object, **kwargs: object) -> dict[str, object]:
        if kwargs.get("call_source") == "backprop_outline":
            return {"sections": [{"title": "One", "slug": "one", "summary": "S"}]}
        return {}

    monkeypatch.setattr(
        "app.services.codebase_service.LLMService.chat_structured",
        _fake_chat_structured,
    )
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"own-ok-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"SOK{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SWOK")
    snap = CodebaseSnapshot(
        id=uuid.uuid4(),
        software_id=sw.id,
        commit_sha="a" * 40,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )
    db_session.add(snap)
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

    await _login_email(client, owner.email)
    r = await client.post(f"/software/{sw.id}/docs/propose-outline", json={"hint": "h"})
    assert r.status_code == 200, r.text
    assert r.json()["sections"][0]["slug"] == "one"
