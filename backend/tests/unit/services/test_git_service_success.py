"""Unit tests for commit_files success path and list_commits normalisation."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services import git_service as gs


@pytest.mark.asyncio
async def test_commit_files_success_201() -> None:
    post_resp = MagicMock()
    post_resp.status_code = 201
    post_resp.json.return_value = {
        "web_url": "https://gitlab.example/commit/1",
        "id": "abc" * 5,
    }
    get_resp = MagicMock()
    get_resp.status_code = 404

    with patch.object(gs, "gitlab_file_exists", new_callable=AsyncMock) as m_ex:
        m_ex.return_value = False
        with patch.object(gs.httpx, "AsyncClient") as mock_cls:
            inst = MagicMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
            inst.get = AsyncMock(return_value=get_resp)
            inst.post = AsyncMock(return_value=post_resp)
            web, short = await gs.commit_files(
                repo_web_url="https://gitlab.com/g/r",
                token="tok",
                branch="main",
                files={"a/b.md": "x"},
                message="m",
            )
    assert "gitlab" in web
    assert short is not None
    assert len(short) == 12


@pytest.mark.asyncio
async def test_list_commits_parses_rows() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [
        {
            "id": "full",
            "short_id": "short",
            "title": "t",
            "message": "m",
            "author_name": None,
            "created_at": "2024-01-01",
            "web_url": "u",
        },
        "skip",
    ]
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        out = await gs.list_commits(
            repo_web_url="https://gitlab.com/g/r",
            token="t",
            branch="main",
        )
    assert len(out) == 1
    assert out[0]["author_name"] == ""


@pytest.mark.asyncio
async def test_commit_files_invalid_url() -> None:
    with pytest.raises(ValueError):
        await gs.commit_files(
            repo_web_url="not-a-url",
            token="t",
            branch="m",
            files={},
            message="m",
        )
