"""Integration tests for POST /projects/{id}/publish (mocked GitLab commit)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_publish_happy_path_mocked_commit(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, sw_id, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
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
        "app.services.conflict_service.ConflictService.run_conflict_analysis",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        "app.services.graph_service.GraphService.detect_section_relationships",
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
async def test_publish_requires_git_configuration(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.post(f"/projects/{pid}/publish", json={})
    assert r.status_code == 400
    assert r.json()["code"] == "GIT_NOT_CONFIGURED"
