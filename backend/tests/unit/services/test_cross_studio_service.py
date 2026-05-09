"""Unit tests for CrossStudioService (mocked AsyncSession)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.deps import StudioAccess
from app.exceptions import ApiError
from app.models import CrossStudioAccess, Software, Studio, StudioMember, User
from app.schemas.cross_studio import CrossStudioRequestCreate, CrossStudioResolveBody
from app.services.cross_studio_service import CrossStudioService


def _make_admin_access(*, studio_id: uuid.UUID, user_id: uuid.UUID) -> StudioAccess:
    user = User(
        id=user_id,
        email=f"u-{user_id.hex[:8]}@example.com",
        password_hash="x",
        display_name="Owner",
        is_platform_admin=False,
    )
    mem = StudioMember(
        studio_id=studio_id,
        user_id=user_id,
        role="studio_admin",
    )
    return StudioAccess(user=user, studio_id=studio_id, membership=mem)


def _make_member_access(*, studio_id: uuid.UUID, user_id: uuid.UUID) -> StudioAccess:
    user = User(
        id=user_id,
        email=f"m-{user_id.hex[:8]}@example.com",
        password_hash="x",
        display_name="Member",
        is_platform_admin=False,
    )
    mem = StudioMember(
        studio_id=studio_id,
        user_id=user_id,
        role="studio_member",
    )
    return StudioAccess(user=user, studio_id=studio_id, membership=mem)


@pytest.mark.asyncio
async def test_create_request_forbidden_when_not_studio_admin() -> None:
    req_sid = uuid.uuid4()
    uid = uuid.uuid4()
    access = _make_member_access(studio_id=req_sid, user_id=uid)
    db = AsyncMock()
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.create_request(
            access,
            CrossStudioRequestCreate(
                target_software_id=uuid.uuid4(), requested_access_level="viewer"
            ),
        )
    assert ei.value.status_code == 403
    assert ei.value.error_code == "FORBIDDEN"


@pytest.mark.asyncio
async def test_create_request_target_software_not_found() -> None:
    req_sid = uuid.uuid4()
    uid = uuid.uuid4()
    access = _make_admin_access(studio_id=req_sid, user_id=uid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.create_request(
            access,
            CrossStudioRequestCreate(
                target_software_id=uuid.uuid4(), requested_access_level="viewer"
            ),
        )
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_create_request_same_studio_invalid_target() -> None:
    req_sid = uuid.uuid4()
    uid = uuid.uuid4()
    sw_id = uuid.uuid4()
    access = _make_admin_access(studio_id=req_sid, user_id=uid)
    sw = Software(
        id=sw_id,
        studio_id=req_sid,
        name="Sw",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.create_request(
            access,
            CrossStudioRequestCreate(target_software_id=sw_id, requested_access_level="viewer"),
        )
    assert ei.value.status_code == 400
    assert ei.value.error_code == "INVALID_TARGET"


@pytest.mark.asyncio
async def test_create_request_duplicate_pending_returns_409() -> None:
    req_sid = uuid.uuid4()
    owner_sid = uuid.uuid4()
    uid = uuid.uuid4()
    sw_id = uuid.uuid4()
    access = _make_admin_access(studio_id=req_sid, user_id=uid)
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="Sw",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)

    dup_result = MagicMock()
    dup_result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute = AsyncMock(return_value=dup_result)

    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.create_request(
            access,
            CrossStudioRequestCreate(target_software_id=sw_id, requested_access_level="viewer"),
        )
    assert ei.value.status_code == 409
    assert ei.value.error_code == "REQUEST_EXISTS"


@pytest.mark.asyncio
async def test_create_request_success() -> None:
    req_sid = uuid.uuid4()
    owner_sid = uuid.uuid4()
    uid = uuid.uuid4()
    sw_id = uuid.uuid4()
    access = _make_admin_access(studio_id=req_sid, user_id=uid)
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="Sw",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)

    dup_result = MagicMock()
    dup_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=dup_result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    svc = CrossStudioService(db)
    out = await svc.create_request(
        access,
        CrossStudioRequestCreate(target_software_id=sw_id, requested_access_level="viewer"),
    )
    assert out.status == "pending"
    assert out.access_level == "viewer"
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_list_pending_for_software_owner_builds_rows() -> None:
    owner_sid = uuid.uuid4()
    rsid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()
    uid_req = uuid.uuid4()

    now = datetime.now(timezone.utc)
    grant = CrossStudioAccess(
        id=gid,
        requesting_studio_id=rsid,
        target_software_id=sw_id,
        requested_by=uid_req,
        approved_by=None,
        access_level="viewer",
        status="pending",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    grant.created_at = now

    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="Target SW",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )
    rs = Studio(id=rsid, name="Req Studio", description=None)
    ur = User(
        id=uid_req,
        email="req@example.com",
        password_hash="x",
        display_name="Req",
        is_platform_admin=False,
    )

    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = [grant]

    db = AsyncMock()
    db.execute = AsyncMock(return_value=exec_result)

    async def get_side(model: type, pk: object) -> object:
        if model is Studio and pk == rsid:
            return rs
        if model is Software and pk == sw_id:
            return sw
        if model is User and pk == uid_req:
            return ur
        return None

    db.get = AsyncMock(side_effect=get_side)

    svc = CrossStudioService(db)
    rows = await svc.list_pending_for_software_owner(
        owner_studio_id=owner_sid, status=None, limit=10
    )
    assert len(rows) == 1
    assert rows[0].id == gid
    assert rows[0].requesting_studio_name == "Req Studio"
    assert rows[0].requester_email == "req@example.com"
    assert rows[0].target_software_name == "Target SW"
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_list_pending_for_software_owner_status_filter() -> None:
    owner_sid = uuid.uuid4()
    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(return_value=exec_result)
    db.get = AsyncMock(return_value=None)
    svc = CrossStudioService(db)
    await svc.list_pending_for_software_owner(
        owner_studio_id=owner_sid, status="approved", limit=3
    )
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_list_by_requesting_studio_builds_rows() -> None:
    req_sid = uuid.uuid4()
    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()
    now = datetime.now(timezone.utc)

    grant = CrossStudioAccess(
        id=gid,
        requesting_studio_id=req_sid,
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="approved",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    grant.created_at = now

    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="Far SW",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )
    os_row = Studio(id=owner_sid, name="Owner Studio", description=None)

    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = [grant]

    db = AsyncMock()
    db.execute = AsyncMock(return_value=exec_result)

    async def get_side(model: type, pk: object) -> object:
        if model is Software and pk == sw_id:
            return sw
        if model is Studio and pk == owner_sid:
            return os_row
        return None

    db.get = AsyncMock(side_effect=get_side)

    svc = CrossStudioService(db)
    rows = await svc.list_by_requesting_studio(requesting_studio_id=req_sid, limit=5)
    assert len(rows) == 1
    assert rows[0].target_software_name == "Far SW"
    assert rows[0].owner_studio_name == "Owner Studio"


@pytest.mark.asyncio
async def test_resolve_grant_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    svc = CrossStudioService(db)
    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    with pytest.raises(ApiError) as ei:
        await svc.resolve(
            uuid.uuid4(),
            owner_studio_id=uuid.uuid4(),
            acting_user=acting,
            body=CrossStudioResolveBody(decision="reject"),
        )
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_resolve_wrong_owner_studio_forbidden(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    other_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="pending",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=other_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.resolve(
            gid,
            owner_studio_id=owner_sid,
            acting_user=acting,
            body=CrossStudioResolveBody(decision="reject"),
        )
    assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_resolve_reject_non_pending_returns_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="approved",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)
    db.flush = AsyncMock()

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.resolve(
            gid,
            owner_studio_id=owner_sid,
            acting_user=acting,
            body=CrossStudioResolveBody(decision="reject"),
        )
    assert ei.value.status_code == 400
    assert ei.value.error_code == "INVALID_STATE"


@pytest.mark.asyncio
async def test_resolve_approve_non_pending_returns_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="rejected",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.resolve(
            gid,
            owner_studio_id=owner_sid,
            acting_user=acting,
            body=CrossStudioResolveBody(decision="approve"),
        )
    assert ei.value.status_code == 400
    assert ei.value.error_code == "INVALID_STATE"


@pytest.mark.asyncio
async def test_resolve_approve_invalid_level(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="pending",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    row.access_level = "bogus"
    with pytest.raises(ApiError) as ei:
        await svc.resolve(
            gid,
            owner_studio_id=owner_sid,
            acting_user=acting,
            body=CrossStudioResolveBody(decision="approve"),
        )
    assert ei.value.status_code == 400
    assert ei.value.error_code == "INVALID_LEVEL"


@pytest.mark.asyncio
async def test_resolve_reject_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="pending",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)
    db.flush = AsyncMock()

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    out = await svc.resolve(
        gid,
        owner_studio_id=owner_sid,
        acting_user=acting,
        body=CrossStudioResolveBody(decision="reject"),
    )
    assert out.status == "rejected"
    assert row.status == "rejected"


@pytest.mark.asyncio
async def test_resolve_approve_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="pending",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)
    db.flush = AsyncMock()

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    out = await svc.resolve(
        gid,
        owner_studio_id=owner_sid,
        acting_user=acting,
        body=CrossStudioResolveBody(
            decision="approve", access_level="external_editor"
        ),
    )
    assert out.status == "approved"
    assert row.access_level == "external_editor"


@pytest.mark.asyncio
async def test_resolve_revoke_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="approved",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)
    db.flush = AsyncMock()

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    out = await svc.resolve(
        gid,
        owner_studio_id=owner_sid,
        acting_user=acting,
        body=CrossStudioResolveBody(decision="revoke"),
    )
    assert out.status == "revoked"
    assert row.status == "revoked"


@pytest.mark.asyncio
async def test_resolve_revoke_non_approved_returns_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def noop_ensure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.cross_studio_service.ensure_studio_owner_membership",
        noop_ensure,
    )

    owner_sid = uuid.uuid4()
    sw_id = uuid.uuid4()
    gid = uuid.uuid4()

    row = CrossStudioAccess(
        id=gid,
        requesting_studio_id=uuid.uuid4(),
        target_software_id=sw_id,
        requested_by=uuid.uuid4(),
        approved_by=None,
        access_level="viewer",
        status="pending",
        resolved_at=None,
        resolved_by_studio_id=None,
    )
    sw = Software(
        id=sw_id,
        studio_id=owner_sid,
        name="X",
        description=None,
        definition=None,
        git_repo_url=None,
        git_token=None,
    )

    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is CrossStudioAccess and pk == gid:
            return row
        if model is Software and pk == sw_id:
            return sw
        return None

    db.get = AsyncMock(side_effect=get_side)

    acting = User(
        id=uuid.uuid4(),
        email="o@example.com",
        password_hash="x",
        display_name="O",
        is_platform_admin=False,
    )
    svc = CrossStudioService(db)
    with pytest.raises(ApiError) as ei:
        await svc.resolve(
            gid,
            owner_studio_id=owner_sid,
            acting_user=acting,
            body=CrossStudioResolveBody(decision="revoke"),
        )
    assert ei.value.status_code == 400
    assert ei.value.error_code == "INVALID_STATE"