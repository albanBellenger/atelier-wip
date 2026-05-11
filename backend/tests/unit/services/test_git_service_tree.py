"""Unit tests for GitLab tree/blob/compare helpers."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import git_service as gs


@pytest.mark.asyncio
async def test_list_repo_tree_collects_blobs() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [
        {"type": "tree", "path": "src", "name": "src", "id": "t1"},
        {"type": "blob", "path": "src/a.py", "name": "a.py", "id": "b1"},
        {"type": "blob", "path": "README.md", "name": "README.md", "id": "b2"},
    ]
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        out = await gs.list_repo_tree(
            repo_web_url="https://gitlab.com/group/repo",
            token="t",
            branch="main",
        )
    assert len(out) == 2
    paths = {x["path"] for x in out}
    assert paths == {"src/a.py", "README.md"}


@pytest.mark.asyncio
async def test_fetch_blob_returns_bytes() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"hello"
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        raw = await gs.fetch_blob(
            repo_web_url="https://gitlab.com/group/repo",
            token="t",
            ref="main",
            file_path="a/b.py",
        )
    assert raw == b"hello"


@pytest.mark.asyncio
async def test_list_commits_since_pages() -> None:
    page1 = MagicMock()
    page1.status_code = 200
    page1.json.return_value = [{"id": "a", "short_id": "a", "title": "x", "message": "m", "author_name": "u"}]
    page2 = MagicMock()
    page2.status_code = 200
    page2.json.return_value = []
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(side_effect=[page1, page2])
        out = await gs.list_commits_since(
            repo_web_url="https://gitlab.com/group/repo",
            token="t",
            branch="main",
            since_iso8601="2024-01-01T00:00:00Z",
            per_page=100,
        )
    assert len(out) == 1
    assert out[0]["id"] == "a"


@pytest.mark.asyncio
async def test_diff_paths_between_parses_diffs() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "diffs": [
            {"old_path": "a.py", "new_path": "a.py"},
            {"old_path": None, "new_path": "b.py"},
        ]
    }
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        paths = await gs.diff_paths_between(
            repo_web_url="https://gitlab.com/group/repo",
            token="t",
            from_sha="aaa",
            to_sha="bbb",
        )
    assert paths == ["a.py", "b.py"]
