"""Studio Owner per-member budget APIs (GET/PATCH under /studios/{id}/...)."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_member_budgets_unauthenticated(client: AsyncClient) -> None:
    rid = uuid.uuid4()
    r = await client.get(f"/studios/{rid}/member-budgets")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_member_budgets_forbidden_for_builder(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_email = f"mb-own-{sfx}@example.com"
    mem_email = f"mb-bld-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": owner_email,
            "password": "securepass123",
            "display_name": "Owner",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": owner_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    owner_tok = r_login.cookies.get("atelier_token")
    assert owner_tok
    client.cookies.set("atelier_token", owner_tok)

    cr = await client.post("/studios", json={"name": f"MBS{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    await client.post(
        "/auth/register",
        json={
            "email": mem_email,
            "password": "securepass123",
            "display_name": "Builder",
        },
    )
    add_mem = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": mem_email, "role": "studio_member"},
    )
    assert add_mem.status_code == 200

    mlogin = await client.post(
        "/auth/login",
        json={"email": mem_email, "password": "securepass123"},
    )
    assert mlogin.status_code == 200
    client.cookies.set("atelier_token", mlogin.cookies.get("atelier_token"))

    denied = await client.get(f"/studios/{studio_id}/member-budgets")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_member_budgets_studio_owner_list_patch(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_email = f"mb-own2-{sfx}@example.com"
    mem_email = f"mb-mem-{sfx}@example.com"

    r = await client.post(
        "/auth/register",
        json={
            "email": owner_email,
            "password": "securepass123",
            "display_name": "Owner",
        },
    )
    assert r.status_code == 200

    r_login = await client.post(
        "/auth/login",
        json={"email": owner_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)

    cr = await client.post("/studios", json={"name": f"MBX{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    mem_reg = await client.post(
        "/auth/register",
        json={
            "email": mem_email,
            "password": "securepass123",
            "display_name": "Member",
        },
    )
    assert mem_reg.status_code == 200

    add_mem = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": mem_email, "role": "studio_member"},
    )
    assert add_mem.status_code == 200

    unknown_studio = uuid.uuid4()
    nf = await client.get(f"/studios/{unknown_studio}/member-budgets")
    assert nf.status_code == 404

    listed = await client.get(f"/studios/{studio_id}/member-budgets")
    assert listed.status_code == 200
    rows = listed.json()
    assert isinstance(rows, list)
    assert len(rows) >= 2
    mem_row = next(x for x in rows if x["email"] == mem_email.lower())
    assert mem_row["budget_cap_monthly_usd"] is None
    assert "mtd_spend_usd" in mem_row
    assert "budget_status" in mem_row
    assert mem_row["budget_status"]["is_capped"] is False

    uid = mem_row["user_id"]
    patch = await client.patch(
        f"/studios/{studio_id}/members/{uid}/budget",
        json={"budget_cap_monthly_usd": "275.50"},
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["user_id"] == uid
    cap = body["budget_cap_monthly_usd"]
    assert cap == "275.50" or cap == 275.5

    clear = await client.patch(
        f"/studios/{studio_id}/members/{uid}/budget",
        json={"budget_cap_monthly_usd": None},
    )
    assert clear.status_code == 200
    assert clear.json()["budget_cap_monthly_usd"] is None

    missing_member = uuid.uuid4()
    bad = await client.patch(
        f"/studios/{studio_id}/members/{missing_member}/budget",
        json={"budget_cap_monthly_usd": "10.00"},
    )
    assert bad.status_code == 404
