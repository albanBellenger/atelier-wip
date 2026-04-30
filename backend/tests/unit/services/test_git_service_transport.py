"""GitLab HTTP client maps transport failures to ApiError."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.exceptions import ApiError
from app.services import git_service as gs


@pytest.mark.asyncio
async def test_list_commits_connect_error_maps_to_api_error() -> None:
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(side_effect=httpx.ConnectError("refused", request=None))
        with pytest.raises(ApiError) as e:
            await gs.list_commits(
                repo_web_url="https://gitlab.com/group/repo",
                token="t",
                branch="main",
            )
        assert e.value.status_code == 502
        assert e.value.error_code == "GITLAB_TRANSPORT_ERROR"


@pytest.mark.asyncio
async def test_list_commits_http_401_maps_to_gitlab_error() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "unauthorized"
    with patch.object(gs.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        with pytest.raises(ApiError) as e:
            await gs.list_commits(
                repo_web_url="https://gitlab.com/group/repo",
                token="t",
                branch="main",
            )
        assert e.value.status_code == 502
        assert e.value.error_code == "GITLAB_ERROR"


@pytest.mark.asyncio
async def test_commit_files_post_timeout_maps_to_api_error() -> None:
    files = {"a.md": "x"}
    with patch.object(gs, "gitlab_file_exists", new_callable=AsyncMock) as m_exists:
        m_exists.return_value = False
        with patch.object(gs.httpx, "AsyncClient") as mock_cls:
            inst = MagicMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
            inst.post = AsyncMock(side_effect=httpx.ReadTimeout("timeout", request=None))
            with pytest.raises(ApiError) as e:
                await gs.commit_files(
                    repo_web_url="https://gitlab.com/g/r",
                    token="tok",
                    branch="main",
                    files=files,
                    message="m",
                )
            assert e.value.error_code == "GITLAB_TRANSPORT_ERROR"
            assert e.value.status_code == 504
