"""Integration tests for POST /projects/{id}/publish (mocked GitLab commit)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_publish_happy_path_mocked_commit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, sw_id, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)

    async def fake_gitlab_test(
        _repo_url: str, _token: str, _branch: str
    ) -> tuple[bool, str]:
        return True, "ok"

    monkeypatch.setattr(
        "app.services.software_service.test_gitlab_connection",
        fake_gitlab_test,
    )

    put_git = await client.put(
        f"/studios/{studio_id}/software/{sw_id}",
        json={
            "definition": "def",
            "git_repo_url": "https://gitlab.example.com/ns/repo",
            "git_branch": "main",
            "git_token": "glpat-test-token-integration",
        },
    )
    assert put_git.status_code == 200, put_git.text

    async def fake_commit(**kwargs) -> tuple[str, str | None]:
        return ("https://gitlab.example.com/commit/abc", "abc123def")

    monkeypatch.setattr("app.services.publish_service.commit_files", fake_commit)
    monkeypatch.setattr(
        "app.services.publish_service.ConflictAgent.run_conflict_analysis",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        "app.services.publish_service.SectionRelationshipAgent.detect_section_relationships",
        AsyncMock(),
    )

    r = await client.post(
        f"/projects/{pid}/publish",
        json={"commit_message": "spec export"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["commit_sha"] == "abc123def"
    assert body["files_committed"] >= 1
    assert "gitlab.example.com" in body["commit_url"]


@pytest.mark.asyncio
async def test_publish_requires_git_configuration(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.post(f"/projects/{pid}/publish", json={})
    assert r.status_code == 400
    assert r.json()["code"] == "GIT_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_publish_software_docs_at_repo_root_same_paths_for_each_project(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Software Docs publish under ``docs/`` at repo root; never under ``<publish_folder_slug>/docs/``."""
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, sw_id, pid1, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)

    pr2 = await client.post(
        f"/software/{sw_id}/projects",
        json={"name": "Second Stream"},
    )
    assert pr2.status_code == 200, pr2.text
    pid2 = pr2.json()["id"]

    doc = await client.post(
        f"/software/{sw_id}/docs",
        json={"title": "API Guide", "slug": "api-guide", "content": "## API\n"},
    )
    assert doc.status_code == 200, doc.text

    async def fake_gitlab_test(
        _repo_url: str, _token: str, _branch: str
    ) -> tuple[bool, str]:
        return True, "ok"

    monkeypatch.setattr(
        "app.services.software_service.test_gitlab_connection",
        fake_gitlab_test,
    )
    put_git = await client.put(
        f"/studios/{studio_id}/software/{sw_id}",
        json={
            "definition": "def",
            "git_repo_url": "https://gitlab.example.com/ns/repo",
            "git_branch": "main",
            "git_token": "glpat-test-token-integration",
        },
    )
    assert put_git.status_code == 200, put_git.text

    captured: list[dict[str, str]] = []

    async def fake_commit(**kwargs: object) -> tuple[str, str | None]:
        files = kwargs.get("files")
        assert isinstance(files, dict)
        captured.append(dict(files))
        return ("https://gitlab.example.com/commit/abc", "abc123def")

    monkeypatch.setattr("app.services.publish_service.commit_files", fake_commit)
    monkeypatch.setattr(
        "app.services.publish_service.ConflictAgent.run_conflict_analysis",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        "app.services.publish_service.SectionRelationshipAgent.detect_section_relationships",
        AsyncMock(),
    )

    g1 = await client.get(f"/software/{sw_id}/projects/{pid1}")
    assert g1.status_code == 200
    slug1 = g1.json()["publish_folder_slug"]
    g2 = await client.get(f"/software/{sw_id}/projects/{pid2}")
    assert g2.status_code == 200
    slug2 = g2.json()["publish_folder_slug"]

    r1 = await client.post(
        f"/projects/{pid1}/publish",
        json={"commit_message": "publish a"},
    )
    assert r1.status_code == 200, r1.text
    files1 = captured[-1]

    assert "docs/README.md" in files1
    assert "docs/api-guide.md" in files1
    assert "## API" in files1["docs/api-guide.md"]
    assert "| API Guide | `docs/api-guide.md` |" in files1["docs/README.md"]
    assert not any(k.startswith(f"{slug1}/docs/") for k in files1)
    assert not any(k.startswith(f"{slug2}/docs/") for k in files1)

    r2 = await client.post(
        f"/projects/{pid2}/publish",
        json={"commit_message": "publish b"},
    )
    assert r2.status_code == 200, r2.text
    files2 = captured[-1]

    assert files1["docs/README.md"] == files2["docs/README.md"]
    assert files1["docs/api-guide.md"] == files2["docs/api-guide.md"]
    assert not any(k.startswith(f"{slug1}/docs/") for k in files2)
    assert not any(k.startswith(f"{slug2}/docs/") for k in files2)
