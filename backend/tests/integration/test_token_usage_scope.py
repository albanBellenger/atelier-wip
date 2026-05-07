"""Token usage reporting scopes and CSV."""

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StudioMember, TokenUsage
from tests.integration.test_work_orders import _studio_project_with_sections


@pytest_asyncio.fixture(autouse=True)
async def _truncate_users(db_session: AsyncSession) -> None:
    await db_session.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
    await db_session.flush()


async def _register(client: AsyncClient, suffix: str, label: str) -> str:
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
    return token


@pytest.mark.asyncio
async def test_token_usage_scope_member_studio_admin_tool_admin_csv(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "ta")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"S{sfx}", "description": ""})
    ).json()["id"]

    token_sa = await _register(client, sfx, "sadmin")
    client.cookies.set("atelier_token", token_ta)
    add_sa = await client.post(
        f"/studios/{studio_a}/members",
        json={"email": f"sadmin-{sfx}@example.com", "role": "studio_admin"},
    )
    assert add_sa.status_code == 200

    token_m = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token_ta)
    add_m = await client.post(
        f"/studios/{studio_a}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )
    assert add_m.status_code == 200

    client.cookies.set("atelier_token", token_sa)
    uid_sa = (await client.get("/auth/me")).json()["user"]["id"]

    client.cookies.set("atelier_token", token_m)
    uid_m = (await client.get("/auth/me")).json()["user"]["id"]

    db_session.add_all(
        [
            TokenUsage(
                studio_id=uuid.UUID(studio_a),
                software_id=None,
                project_id=None,
                user_id=uuid.UUID(uid_m),
                call_type="chat",
                model="gpt-test",
                input_tokens=10,
                output_tokens=20,
                estimated_cost_usd=Decimal("0.010000"),
            ),
            TokenUsage(
                studio_id=uuid.UUID(studio_a),
                software_id=None,
                project_id=None,
                user_id=uuid.UUID(uid_sa),
                call_type="thread",
                model="gpt-test",
                input_tokens=5,
                output_tokens=5,
                estimated_cost_usd=Decimal("0.005000"),
            ),
        ]
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_m)
    me_r = await client.get("/me/token-usage")
    assert me_r.status_code == 200
    body = me_r.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["user_id"] == uid_m
    assert "work_order_id" in body["rows"][0]

    client.cookies.set("atelier_token", token_sa)
    st_r = await client.get(f"/studios/{studio_a}/token-usage")
    assert st_r.status_code == 200
    st_body = st_r.json()
    assert len(st_body["rows"]) == 2

    csv_studio = await client.get(
        f"/studios/{studio_a}/token-usage",
        headers={"Accept": "text/csv"},
    )
    assert csv_studio.status_code == 200
    disp = csv_studio.headers.get("content-disposition") or ""
    assert "attachment" in disp.lower()
    assert "call_type" in csv_studio.text

    token_out = await _register(client, sfx, "outsider")
    client.cookies.set("atelier_token", token_out)
    forbidden = await client.get(f"/studios/{studio_a}/token-usage")
    assert forbidden.status_code == 403

    client.cookies.set("atelier_token", token_ta)
    admin_r = await client.get("/admin/token-usage")
    assert admin_r.status_code == 200
    assert len(admin_r.json()["rows"]) >= 2

    csv_r = await client.get(
        "/admin/token-usage",
        headers={"Accept": "text/csv"},
    )
    assert csv_r.status_code == 200
    assert "text/csv" in (csv_r.headers.get("content-type") or "")
    assert "call_type" in csv_r.text

    # --- /me/token-usage?studio_id=... (member: filter rows; outsider: 403) ---
    other = (
        await client.post("/studios", json={"name": f"Other{sfx}", "description": ""})
    ).json()["id"]
    client.cookies.set("atelier_token", token_m)
    me_studio = await client.get(
        "/me/token-usage", params={"studio_id": studio_a, "limit": 5000}
    )
    assert me_studio.status_code == 200
    me_body = me_studio.json()
    assert len(me_body["rows"]) == 1
    assert me_body["rows"][0]["studio_id"] == studio_a

    bad_studio = await client.get(
        "/me/token-usage", params={"studio_id": other, "limit": 5000}
    )
    assert bad_studio.status_code == 403

    nf = await client.get(
        "/me/token-usage",
        params={"studio_id": str(uuid.uuid4()), "limit": 5000},
    )
    assert nf.status_code == 404

    client.cookies.clear()
    anon = await client.get(
        "/me/token-usage", params={"studio_id": studio_a, "limit": 5000}
    )
    assert anon.status_code == 401

    client.cookies.set("atelier_token", token_m)
    csv_me = await client.get(
        "/me/token-usage",
        params={"studio_id": studio_a, "limit": 5000},
        headers={"Accept": "text/csv"},
    )
    assert csv_me.status_code == 200
    assert "call_type" in csv_me.text
    assert "work_order_id" in csv_me.text.split("\n")[0]

    client.cookies.set("atelier_token", token_m)
    me_ct = await client.get(
        "/me/token-usage",
        params=[("call_type", "chat"), ("call_type", "thread")],
    )
    assert me_ct.status_code == 200
    assert len(me_ct.json()["rows"]) == 1

    rand_sw = str(uuid.uuid4())
    bad_sw = await client.get(
        "/me/token-usage",
        params={"software_id": rand_sw, "limit": 5000},
    )
    assert bad_sw.status_code == 404

    client.cookies.set("atelier_token", token_m)
    me_multi = await client.get(
        "/me/token-usage",
        params=[("studio_id", studio_a), ("studio_id", studio_a)],
    )
    assert me_multi.status_code == 200
    assert len(me_multi.json()["rows"]) == 1

    client.cookies.set("atelier_token", token_ta)
    me_ta_studio = await client.get(
        "/me/token-usage", params={"studio_id": studio_a, "limit": 5000}
    )
    assert me_ta_studio.status_code == 200


@pytest.mark.asyncio
async def test_me_token_usage_project_and_work_order_filters_and_404s(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Exercise project_id / work_order_id validation and filtering on /me/token-usage."""
    sfx = uuid.uuid4().hex[:8]
    (
        _token_admin,
        studio_id,
        software_id,
        project_id,
        section_a,
        _section_b,
    ) = await _studio_project_with_sections(client, sfx)

    token_member = await _register(client, sfx, "pw_member")
    client.cookies.set("atelier_token", _token_admin)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"pw_member-{sfx}@example.com", "role": "studio_member"},
    )

    client.cookies.set("atelier_token", token_member)
    wo_resp = await client.post(
        f"/projects/{project_id}/work-orders",
        json={
            "title": "WO token filter",
            "description": "d",
            "status": "backlog",
            "section_ids": [section_a],
        },
    )
    assert wo_resp.status_code == 200, wo_resp.text
    work_order_id = wo_resp.json()["id"]

    uid = (await client.get("/auth/me")).json()["user"]["id"]

    db_session.add_all(
        [
            TokenUsage(
                studio_id=uuid.UUID(studio_id),
                software_id=uuid.UUID(software_id),
                project_id=uuid.UUID(project_id),
                work_order_id=None,
                user_id=uuid.UUID(uid),
                call_type="chat",
                model="gpt-test",
                input_tokens=7,
                output_tokens=8,
                estimated_cost_usd=Decimal("0.010000"),
            ),
            TokenUsage(
                studio_id=uuid.UUID(studio_id),
                software_id=uuid.UUID(software_id),
                project_id=uuid.UUID(project_id),
                work_order_id=uuid.UUID(work_order_id),
                user_id=uuid.UUID(uid),
                call_type="thread",
                model="gpt-test",
                input_tokens=3,
                output_tokens=4,
                estimated_cost_usd=Decimal("0.005000"),
            ),
        ]
    )
    await db_session.flush()

    by_project = await client.get(
        "/me/token-usage",
        params={"project_id": project_id, "limit": 5000},
    )
    assert by_project.status_code == 200
    assert len(by_project.json()["rows"]) == 2

    by_wo = await client.get(
        "/me/token-usage",
        params={"work_order_id": work_order_id, "limit": 5000},
    )
    assert by_wo.status_code == 200
    assert len(by_wo.json()["rows"]) == 1
    assert by_wo.json()["rows"][0]["call_type"] == "thread"

    nf_proj = await client.get(
        "/me/token-usage",
        params={"project_id": str(uuid.uuid4()), "limit": 5000},
    )
    assert nf_proj.status_code == 404

    nf_wo = await client.get(
        "/me/token-usage",
        params={"work_order_id": str(uuid.uuid4()), "limit": 5000},
    )
    assert nf_wo.status_code == 404

    csv_proj = await client.get(
        "/me/token-usage",
        params={"project_id": project_id, "limit": 5000},
        headers={"Accept": "text/csv"},
    )
    assert csv_proj.status_code == 200
    assert "text/csv" in (csv_proj.headers.get("content-type") or "").lower()
    assert csv_proj.text.count("\n") >= 3


@pytest.mark.asyncio
async def test_me_token_usage_budget_studio_id_cap_and_spend(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register(client, sfx, "budown")
    client.cookies.set("atelier_token", token_owner)
    studio_a = (
        await client.post("/studios", json={"name": f"Bud{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "budmember")
    client.cookies.set("atelier_token", token_owner)
    add_m = await client.post(
        f"/studios/{studio_a}/members",
        json={"email": f"budmember-{sfx}@example.com", "role": "studio_member"},
    )
    assert add_m.status_code == 200

    client.cookies.set("atelier_token", token_m)
    uid_m = (await client.get("/auth/me")).json()["user"]["id"]

    await db_session.execute(
        update(StudioMember)
        .where(
            StudioMember.studio_id == uuid.UUID(studio_a),
            StudioMember.user_id == uuid.UUID(uid_m),
        )
        .values(budget_cap_monthly_usd=Decimal("100.00"))
    )
    await db_session.flush()

    db_session.add(
        TokenUsage(
            studio_id=uuid.UUID(studio_a),
            software_id=None,
            project_id=None,
            user_id=uuid.UUID(uid_m),
            call_type="chat",
            model="gpt-test",
            input_tokens=10,
            output_tokens=20,
            estimated_cost_usd=Decimal("12.500000"),
        ),
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_m)
    plain = await client.get("/me/token-usage", params={"limit": 10})
    assert plain.status_code == 200
    assert plain.json().get("builder_budget") is None

    with_budget = await client.get(
        "/me/token-usage",
        params={"limit": 10, "budget_studio_id": studio_a},
    )
    assert with_budget.status_code == 200
    bb = with_budget.json()["builder_budget"]
    assert bb is not None
    assert bb["studio_id"] == studio_a
    assert Decimal(str(bb["spent_monthly_usd"])) == Decimal("12.5")
    assert Decimal(str(bb["cap_monthly_usd"])) == Decimal("100")
    st = bb["budget_status"]
    assert st["is_capped"] is True
    assert st["severity"] == "ok"
    assert st["blocks_new_usage"] is False
    assert Decimal(str(st["remaining_monthly_usd"])) == Decimal("87.5")

    token_out = await _register(client, sfx, "budoutsider")
    client.cookies.set("atelier_token", token_out)
    denied_bb = await client.get(
        "/me/token-usage",
        params={"limit": 10, "budget_studio_id": studio_a},
    )
    assert denied_bb.status_code == 403

    client.cookies.set("atelier_token", token_m)
    nf_bb = await client.get(
        "/me/token-usage",
        params={"limit": 10, "budget_studio_id": str(uuid.uuid4())},
    )
    assert nf_bb.status_code == 404
