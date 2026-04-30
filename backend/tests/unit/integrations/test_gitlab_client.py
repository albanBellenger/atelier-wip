"""Unit tests for GitLab URL parsing and GitLab HTTP helpers."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.integrations import gitlab_client as gc


def test_parse_gitlab_web_url_empty() -> None:
    assert gc.parse_gitlab_web_url("") == (None, None)
    assert gc.parse_gitlab_web_url("   ") == (None, None)


def test_parse_gitlab_web_url_invalid_scheme() -> None:
    assert gc.parse_gitlab_web_url("notaurl") == (None, None)


def test_parse_gitlab_strips_git_suffix() -> None:
    o, p = gc.parse_gitlab_web_url("https://gitlab.com/foo/bar.git")
    assert o == "https://gitlab.com"
    assert p == "foo/bar"


@pytest.mark.asyncio
async def test_test_gitlab_connection_ok() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    with patch.object(gc.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        ok, msg = await gc.test_gitlab_connection(
            "https://gitlab.com/g/p",
            "t",
            "main",
        )
    assert ok is True
    assert "OK" in msg


@pytest.mark.asyncio
async def test_test_gitlab_connection_401() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    with patch.object(gc.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(return_value=mock_resp)
        ok, msg = await gc.test_gitlab_connection(
            "https://gitlab.com/g/p",
            "t",
            "main",
        )
    assert ok is False
    assert "401" in msg


@pytest.mark.asyncio
async def test_test_gitlab_connection_network() -> None:
    with patch.object(gc.httpx, "AsyncClient") as mock_cls:
        inst = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=inst)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        inst.get = AsyncMock(side_effect=httpx.ConnectError("nope", request=None))
        ok, msg = await gc.test_gitlab_connection(
            "https://gitlab.com/g/p",
            "t",
            "main",
        )
    assert ok is False
    assert "Network" in msg


@pytest.mark.asyncio
async def test_test_gitlab_connection_bad_url() -> None:
    ok, msg = await gc.test_gitlab_connection("", "t", "main")
    assert ok is False


@pytest.mark.asyncio
async def test_test_gitlab_empty_token() -> None:
    ok, msg = await gc.test_gitlab_connection("https://gitlab.com/g/p", "  ", "main")
    assert ok is False
    assert "token" in msg.lower()
