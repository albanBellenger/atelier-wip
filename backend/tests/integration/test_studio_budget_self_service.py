"""Studio Owner budget self-service without platform admin."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_studio_owner_patch_budget_and_list_member_budgets_without_platform_admin(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_email = f"sbss-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": owner_email,
            "password": "securepass123",
            "display_name": "Owner",
        },
    )
    login = await client.post(
        "/auth/login",
        json={"email": owner_email, "password": "securepass123"},
    )
    assert login.status_code == 200
    client.cookies.set("atelier_token", login.cookies.get("atelier_token"))

    cr = await client.post("/studios", json={"name": f"SB{sfx}", "description": ""})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    patch = await client.patch(
        f"/studios/{studio_id}/budget",
        json={"budget_cap_monthly_usd": "500.00"},
    )
    assert patch.status_code == 204

    listed = await client.get(f"/studios/{studio_id}/member-budgets")
    assert listed.status_code == 200


@pytest.mark.asyncio
async def test_studio_builder_cannot_patch_studio_budget(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_email = f"sbss-o-{sfx}@example.com"
    mem_email = f"sbss-m-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": owner_email,
            "password": "securepass123",
            "display_name": "Owner",
        },
    )
    ologin = await client.post(
        "/auth/login",
        json={"email": owner_email, "password": "securepass123"},
    )
    client.cookies.set("atelier_token", ologin.cookies.get("atelier_token"))
    cr = await client.post("/studios", json={"name": f"SBB{sfx}", "description": ""})
    studio_id = cr.json()["id"]

    await client.post(
        "/auth/register",
        json={
            "email": mem_email,
            "password": "securepass123",
            "display_name": "Builder",
        },
    )
    add = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": mem_email, "role": "studio_member"},
    )
    assert add.status_code == 200

    mlogin = await client.post(
        "/auth/login",
        json={"email": mem_email, "password": "securepass123"},
    )
    client.cookies.set("atelier_token", mlogin.cookies.get("atelier_token"))

    denied = await client.patch(
        f"/studios/{studio_id}/budget",
        json={"budget_cap_monthly_usd": "100.00"},
    )
    assert denied.status_code == 403
