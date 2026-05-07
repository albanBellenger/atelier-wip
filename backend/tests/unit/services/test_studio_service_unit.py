"""Unit tests for StudioService (mocked AsyncSession)."""

from __future__ import annotations

import types
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.deps import StudioAccess
from app.exceptions import ApiError
from app.models import User
from app.schemas.studio import (
    MemberInvite,
    MemberRoleUpdate,
    StudioCreate,
    StudioResponse,
    StudioUpdate,
)
from app.services.studio_service import StudioService


def _access(user_id: uuid.UUID, studio_id: uuid.UUID) -> StudioAccess:
    u = MagicMock(spec=User)
    u.id = user_id
    u.is_platform_admin = False
    return StudioAccess(user=u, studio_id=studio_id, membership=None)


@pytest.mark.asyncio
async def test_list_studios_tool_admin_queries_all() -> None:
    sid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    row = types.SimpleNamespace(
        id=sid,
        name="Alpha",
        description=None,
        logo_path=None,
        created_at=now,
        budget_cap_monthly_usd=None,
        budget_overage_action="pause_generations",
    )
    result = MagicMock()
    result.all.return_value = [row]
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)

    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.is_platform_admin = True

    out = await StudioService(db).list_studios(user)
    assert len(out) == 1
    assert out[0].id == sid
    assert out[0].name == "Alpha"
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_studios_member_joins_membership() -> None:
    now = datetime.now(timezone.utc)
    row = types.SimpleNamespace(
        id=uuid.uuid4(),
        name="B",
        description="d",
        logo_path="/l.png",
        created_at=now,
        budget_cap_monthly_usd=None,
        budget_overage_action="pause_generations",
    )
    result = MagicMock()
    result.all.return_value = [row]
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)

    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.is_platform_admin = False

    out = await StudioService(db).list_studios(user)
    assert out[0].logo_path == "/l.png"
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_studio_strips_name_and_adds_admin_member() -> None:
    uid = uuid.uuid4()
    user = MagicMock(spec=User)
    user.id = uid
    user.is_platform_admin = False

    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    fixed = StudioResponse(
        id=uuid.uuid4(),
        name="Spaced",
        description="desc",
        logo_path=None,
        created_at=datetime.now(timezone.utc),
    )
    with patch(
        "app.services.studio_service.StudioResponse.model_validate",
        return_value=fixed,
    ) as mv:
        svc = StudioService(db)
        resp = await svc.create_studio(
            user,
            StudioCreate(name="  Spaced  ", description="  desc  "),
        )
    assert resp.name == "Spaced"
    assert resp.description == "desc"
    assert db.add.call_count == 2
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once()
    studio_arg = mv.call_args[0][0]
    assert studio_arg.name == "Spaced"
    assert studio_arg.description == "desc"


@pytest.mark.asyncio
async def test_get_studio_returns_response() -> None:
    sid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    studio = types.SimpleNamespace(
        id=sid,
        name="S",
        description=None,
        logo_path=None,
        created_at=now,
    )
    db = MagicMock()
    db.get = AsyncMock(return_value=studio)

    acc = _access(uuid.uuid4(), sid)
    out = await StudioService(db).get_studio(acc)
    assert out.id == sid
    assert out.name == "S"


@pytest.mark.asyncio
async def test_update_studio_strips_optional_description_empty() -> None:
    sid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    row = types.SimpleNamespace(
        id=sid,
        name="Old",
        description="x",
        logo_path=None,
        created_at=now,
    )
    db = MagicMock()
    db.get = AsyncMock(return_value=row)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    fixed = StudioResponse(
        id=sid,
        name="Old",
        description=None,
        logo_path=None,
        created_at=now,
    )
    acc = _access(uuid.uuid4(), sid)
    with patch(
        "app.services.studio_service.StudioResponse.model_validate",
        return_value=fixed,
    ):
        await StudioService(db).update_studio(
            acc,
            StudioUpdate(name=None, description="   "),
        )
    assert row.description == ""
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_studio_strips_name_when_provided() -> None:
    sid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    row = types.SimpleNamespace(
        id=sid,
        name="Old",
        description=None,
        logo_path=None,
        created_at=now,
    )
    db = MagicMock()
    db.get = AsyncMock(return_value=row)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    fixed = StudioResponse(
        id=sid,
        name="Renamed",
        description=None,
        logo_path=None,
        created_at=now,
    )
    acc = _access(uuid.uuid4(), sid)
    with patch(
        "app.services.studio_service.StudioResponse.model_validate",
        return_value=fixed,
    ):
        await StudioService(db).update_studio(
            acc,
            StudioUpdate(name="  Renamed  ", description=None),
        )
    assert row.name == "Renamed"


@pytest.mark.asyncio
async def test_delete_studio_by_id_noop_when_missing() -> None:
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    await StudioService(db).delete_studio_by_id(uuid.uuid4())
    db.delete.assert_not_called()


@pytest.mark.asyncio
async def test_delete_studio_by_id_deletes_row() -> None:
    sid = uuid.uuid4()
    row = MagicMock()
    db = MagicMock()
    db.get = AsyncMock(return_value=row)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    await StudioService(db).delete_studio_by_id(sid)
    db.delete.assert_awaited_once_with(row)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_members_maps_rows() -> None:
    sid = uuid.uuid4()
    uid = uuid.uuid4()
    joined = datetime.now(timezone.utc)
    tup = (uid, "a@b.com", "Alice", "studio_admin", joined)
    result = MagicMock()
    result.all.return_value = [tup]
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)

    acc = _access(uuid.uuid4(), sid)
    members = await StudioService(db).list_members(acc)
    assert len(members) == 1
    assert members[0].email == "a@b.com"
    assert members[0].role == "studio_admin"


@pytest.mark.asyncio
async def test_add_member_user_not_found() -> None:
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)
    acc = _access(uuid.uuid4(), uuid.uuid4())

    with pytest.raises(ApiError) as e:
        await StudioService(db).add_member(
            acc,
            MemberInvite(email="missing@example.com", role="studio_member"),
        )
    assert e.value.status_code == 404
    assert e.value.error_code == "USER_NOT_FOUND"


@pytest.mark.asyncio
async def test_add_member_already_member() -> None:
    uid = uuid.uuid4()
    db = MagicMock()
    db.scalar = AsyncMock(side_effect=[uid, uid])
    acc = _access(uuid.uuid4(), uuid.uuid4())

    with pytest.raises(ApiError) as e:
        await StudioService(db).add_member(
            acc,
            MemberInvite(email="exists@example.com", role="studio_member"),
        )
    assert e.value.status_code == 409
    assert e.value.error_code == "ALREADY_MEMBER"


@pytest.mark.asyncio
async def test_add_member_success_normalizes_email() -> None:
    studio_id = uuid.uuid4()
    uid = uuid.uuid4()
    joined = datetime.now(timezone.utc)
    fetch_row = MagicMock()
    fetch_row.user_id = uid
    fetch_row.email = "new@example.com"
    fetch_row.display_name = "N"
    fetch_row.role = "studio_viewer"
    fetch_row.joined_at = joined
    fetch_res = MagicMock()
    fetch_res.one.return_value = fetch_row

    db = MagicMock()
    db.scalar = AsyncMock(side_effect=[uid, None])
    db.execute = AsyncMock(return_value=fetch_res)
    db.commit = AsyncMock()

    acc = _access(uuid.uuid4(), studio_id)
    out = await StudioService(db).add_member(
        acc,
        MemberInvite(email="  NEW@Example.COM  ", role="studio_viewer"),
    )
    assert out.user_id == uid
    assert out.role == "studio_viewer"


@pytest.mark.asyncio
async def test_remove_member_cannot_remove_self() -> None:
    uid = uuid.uuid4()
    u = MagicMock(spec=User)
    u.id = uid
    acc = StudioAccess(user=u, studio_id=uuid.uuid4(), membership=None)

    with pytest.raises(ApiError) as e:
        await StudioService(MagicMock()).remove_member(acc, uid)
    assert e.value.error_code == "CANNOT_REMOVE_SELF"


@pytest.mark.asyncio
async def test_remove_member_not_found() -> None:
    uid = uuid.uuid4()
    acc = _access(uuid.uuid4(), uuid.uuid4())
    select_res = MagicMock()
    select_res.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.scalar = AsyncMock(return_value=2)
    db.execute = AsyncMock(return_value=select_res)

    with pytest.raises(ApiError) as e:
        await StudioService(db).remove_member(acc, uid)
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_remove_member_last_admin_blocked() -> None:
    other = uuid.uuid4()
    acc = _access(uuid.uuid4(), uuid.uuid4())
    select_res = MagicMock()
    select_res.scalar_one_or_none.return_value = "studio_admin"
    db = MagicMock()
    db.scalar = AsyncMock(return_value=1)
    db.execute = AsyncMock(return_value=select_res)

    with pytest.raises(ApiError) as e:
        await StudioService(db).remove_member(acc, other)
    assert e.value.error_code == "LAST_ADMIN"


@pytest.mark.asyncio
async def test_remove_member_success() -> None:
    other = uuid.uuid4()
    acc = _access(uuid.uuid4(), uuid.uuid4())
    select_res = MagicMock()
    select_res.scalar_one_or_none.return_value = "studio_member"
    del_res = MagicMock()
    db = MagicMock()
    db.scalar = AsyncMock(return_value=2)
    db.execute = AsyncMock(side_effect=[select_res, del_res])
    db.commit = AsyncMock()

    await StudioService(db).remove_member(acc, other)
    assert db.execute.await_count == 2
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_member_role_not_found() -> None:
    uid = uuid.uuid4()
    acc = _access(uuid.uuid4(), uuid.uuid4())
    select_res = MagicMock()
    select_res.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute = AsyncMock(return_value=select_res)

    with pytest.raises(ApiError) as e:
        await StudioService(db).update_member_role(
            acc,
            uid,
            MemberRoleUpdate(role="studio_member"),
        )
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_update_member_role_last_admin_demote_blocked() -> None:
    uid = uuid.uuid4()
    acc = _access(uuid.uuid4(), uuid.uuid4())
    select_res = MagicMock()
    select_res.scalar_one_or_none.return_value = "studio_admin"
    db = MagicMock()
    db.execute = AsyncMock(return_value=select_res)
    db.scalar = AsyncMock(return_value=1)

    with pytest.raises(ApiError) as e:
        await StudioService(db).update_member_role(
            acc,
            uid,
            MemberRoleUpdate(role="studio_viewer"),
        )
    assert e.value.error_code == "LAST_ADMIN"


@pytest.mark.asyncio
async def test_update_member_role_success() -> None:
    uid = uuid.uuid4()
    sid = uuid.uuid4()
    joined = datetime.now(timezone.utc)
    acc = _access(uuid.uuid4(), sid)

    role_res = MagicMock()
    role_res.scalar_one_or_none.return_value = "studio_member"
    upd_res = MagicMock()
    fetch_row = MagicMock()
    fetch_row.user_id = uid
    fetch_row.email = "m@example.com"
    fetch_row.display_name = "M"
    fetch_row.role = "studio_admin"
    fetch_row.joined_at = joined
    fetch_res = MagicMock()
    fetch_res.one.return_value = fetch_row

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[role_res, upd_res, fetch_res])
    db.commit = AsyncMock()

    out = await StudioService(db).update_member_role(
        acc,
        uid,
        MemberRoleUpdate(role="studio_admin"),
    )
    assert out.role == "studio_admin"
    db.commit.assert_awaited_once()
