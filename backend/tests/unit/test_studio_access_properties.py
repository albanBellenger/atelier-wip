"""Branch coverage for StudioAccess helpers (deps)."""

from __future__ import annotations

import uuid

from app.deps import StudioAccess
from app.models.cross_studio import CrossStudioAccess
from app.models.studio import StudioMember
from app.models.user import User


def _user(tool_admin: bool = False) -> User:
    return User(
        id=uuid.uuid4(),
        email="u@example.com",
        password_hash="x",
        display_name="U",
        is_platform_admin=tool_admin,
    )


def _grant(level: str) -> CrossStudioAccess:
    from datetime import datetime, timezone

    return CrossStudioAccess(
        id=uuid.uuid4(),
        requesting_studio_id=uuid.uuid4(),
        target_software_id=uuid.uuid4(),
        requested_by=uuid.uuid4(),
        approved_by=uuid.uuid4(),
        access_level=level,
        status="approved",
        created_at=datetime.now(timezone.utc),
        resolved_at=None,
    )


def test_tool_admin_is_studio_admin_and_editor_and_publish() -> None:
    u = _user(tool_admin=True)
    sa = StudioAccess(
        user=u,
        studio_id=uuid.uuid4(),
        membership=None,
        cross_studio_grant=None,
    )
    assert sa.is_studio_admin is True
    assert sa.is_studio_editor is True
    assert sa.can_publish is True
    assert sa.can_edit_software_definition is True
    assert sa.can_create_project is True
    assert sa.is_studio_viewer is False


def test_member_roles() -> None:
    u = _user()
    mid = uuid.uuid4()
    for role, expect_admin, expect_create, expect_defn, expect_viewer in [
        ("studio_admin", True, True, True, False),
        ("studio_member", False, True, False, False),
        ("studio_viewer", False, False, False, True),
    ]:
        m = StudioMember(studio_id=mid, user_id=u.id, role=role)
        sa = StudioAccess(user=u, studio_id=mid, membership=m, cross_studio_grant=None)
        assert sa.is_studio_admin is expect_admin
        assert sa.is_studio_member is True
        assert sa.can_create_project is expect_create
        assert sa.can_edit_software_definition is expect_defn
        assert sa.is_studio_viewer is expect_viewer


def test_cross_studio_viewer_flags() -> None:
    u = _user()
    sa = StudioAccess(
        user=u,
        studio_id=uuid.uuid4(),
        membership=None,
        cross_studio_grant=_grant("viewer"),
    )
    assert sa.is_cross_studio_viewer is True
    assert sa.is_cross_studio_external_editor is False
    assert sa.is_studio_admin is False
    assert sa.can_publish is False
    assert sa.can_edit_software_definition is False
    assert sa.can_create_project is False
    assert sa.is_studio_viewer is False


def test_cross_studio_external_editor() -> None:
    u = _user()
    sa = StudioAccess(
        user=u,
        studio_id=uuid.uuid4(),
        membership=None,
        cross_studio_grant=_grant("external_editor"),
    )
    assert sa.is_cross_studio_external_editor is True
    assert sa.is_studio_editor is True
    assert sa.can_publish is False
    assert sa.can_edit_software_definition is False
    assert sa.is_studio_viewer is False


def test_no_membership_no_grant_not_member() -> None:
    u = _user()
    sa = StudioAccess(
        user=u,
        studio_id=uuid.uuid4(),
        membership=None,
        cross_studio_grant=None,
    )
    assert sa.is_studio_member is False
    assert sa.is_studio_editor is False
    assert sa.is_studio_viewer is False
