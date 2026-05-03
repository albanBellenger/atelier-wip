"""Unit tests for PublishService file map and publish guards."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import ApiError
from app.models import Project, Section, Software, WorkOrder
from app.services.publish_service import PublishResult, PublishService


@pytest.mark.asyncio
async def test_build_file_map_project_missing() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ApiError) as e:
        await PublishService(db).build_file_map(uuid.uuid4())
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_build_file_map_includes_sections_readme_and_exported_wos() -> None:
    pid = uuid.uuid4()
    wid = uuid.uuid4()
    proj = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="Alpha",
        description="desc line",
        publish_folder_slug="alpha",
    )
    sec = Section(
        id=uuid.uuid4(),
        project_id=pid,
        title="Intro",
        slug="intro",
        order=0,
        content="spec body\n",
    )
    wo = WorkOrder(
        id=wid,
        project_id=pid,
        title="Task",
        description="Do it",
        status="backlog",
        phase="p1",
        implementation_guide=None,
        acceptance_criteria=None,
    )

    db = AsyncMock()
    db.get = AsyncMock(return_value=proj)
    ex1 = MagicMock()
    ex1.scalars.return_value.all.return_value = [sec]
    ex2 = MagicMock()
    ex2.scalars.return_value.unique.return_value.all.return_value = [wo]
    db.execute = AsyncMock(side_effect=[ex1, ex2])

    files = await PublishService(db).build_file_map(pid)
    assert files["alpha/sections/intro.md"].strip() == "spec body"
    assert "work-orders/" in "".join(files.keys())
    assert files[f"alpha/work-orders/{wid}.md"].startswith("# Task")
    assert "Alpha" in files["alpha/README.md"]
    assert "| Intro |" in files["alpha/README.md"]


@pytest.mark.asyncio
async def test_build_file_map_skips_done_work_orders() -> None:
    pid = uuid.uuid4()
    proj = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=pid,
        title="Done",
        description="x",
        status="done",
        phase=None,
        implementation_guide=None,
        acceptance_criteria=None,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=proj)
    ex1 = MagicMock()
    ex1.scalars.return_value.all.return_value = []
    ex2 = MagicMock()
    ex2.scalars.return_value.unique.return_value.all.return_value = [wo]
    db.execute = AsyncMock(side_effect=[ex1, ex2])
    files = await PublishService(db).build_file_map(pid)
    assert not any(k.startswith("p/work-orders/") for k in files)


@pytest.mark.asyncio
async def test_publish_forbidden_without_editor() -> None:
    pa = MagicMock()
    pa.studio_access.is_studio_editor = False
    db = AsyncMock()
    with pytest.raises(ApiError) as e:
        await PublishService(db).publish(access=pa, commit_message="m")
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_publish_git_not_configured_missing_repo() -> None:
    pa = MagicMock()
    pa.studio_access.is_studio_editor = True
    pa.software = MagicMock()
    pa.software.git_repo_url = None
    pa.software.git_branch = "main"
    pa.software.git_token = "x"
    pa.project = MagicMock()
    db = AsyncMock()
    with pytest.raises(ApiError) as e:
        await PublishService(db).publish(access=pa, commit_message=None)
    assert e.value.error_code == "GIT_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_publish_success_commits_and_returns_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uid = uuid.uuid4()
    pid = uuid.uuid4()
    sw_id = uuid.uuid4()

    pa = MagicMock()
    pa.studio_access.is_studio_editor = True
    pa.studio_access.user.id = uid
    pa.software = MagicMock()
    pa.software.id = sw_id
    pa.software.git_repo_url = "https://gitlab.example/g/r"
    pa.software.git_branch = "main"
    pa.software.git_token = "enc"
    pa.project = MagicMock()
    pa.project.id = pid
    pa.project.name = "PN"

    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    pa.software.studio_id = uuid.uuid4()

    async def fake_build(self, project_id):
        return {"README.md": "# x\n"}

    monkeypatch.setattr(PublishService, "build_file_map", fake_build)

    monkeypatch.setattr(
        "app.services.publish_service.decrypt_secret",
        lambda _t: "plain-token",
    )
    monkeypatch.setattr(
        "app.services.publish_service.fernet_configured",
        lambda: True,
    )

    async def fake_commit(**kwargs):
        return ("https://gitlab.example/commit/abc", "sha1")

    monkeypatch.setattr(
        "app.services.publish_service.commit_files",
        fake_commit,
    )

    class _PubSessionCM:
        def __init__(self) -> None:
            self.sess = MagicMock()
            proj_row = MagicMock()
            self.sess.get = AsyncMock(return_value=proj_row)
            self.sess.commit = AsyncMock()

        async def __aenter__(self) -> MagicMock:
            return self.sess

        async def __aexit__(self, *args: object) -> None:
            return None

    def _pub_factory() -> _PubSessionCM:
        return _PubSessionCM()

    monkeypatch.setattr(
        "app.services.publish_service.async_session_factory", _pub_factory
    )

    class _FakeND:
        def __init__(self, _db: object) -> None:
            pass

        async def publish_commit(self, **_kw: object) -> int:
            return 0

    monkeypatch.setattr(
        "app.services.publish_service.NotificationDispatchService",
        _FakeND,
    )
    monkeypatch.setattr(
        "app.services.publish_service.ConflictService.run_conflict_analysis",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        "app.services.publish_service.GraphService.detect_section_relationships",
        AsyncMock(),
    )

    out = await PublishService(db).publish(access=pa, commit_message="ship")
    assert isinstance(out, PublishResult)
    assert out.commit_sha == "sha1"
    assert out.files_committed == 1
    assert "gitlab.example" in out.commit_url
    db.commit.assert_called()
