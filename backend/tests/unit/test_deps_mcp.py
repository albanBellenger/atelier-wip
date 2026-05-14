"""Regression: MCP API key extraction and editor gate (Slice 12)."""

from __future__ import annotations

import uuid

import pytest
from starlette.requests import Request

from app.deps_mcp import McpAuth, _extract_raw_key, require_mcp_editor
from app.exceptions import ApiError


def _http_request(headers: list[tuple[bytes, bytes]]) -> Request:
    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/mcp/v1/work-orders",
        "raw_path": b"/mcp/v1/work-orders",
        "root_path": "",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_extract_raw_key_bearer_case_insensitive() -> None:
    req = _http_request([(b"authorization", b"BeArEr  my-secret")])
    assert _extract_raw_key(req) == "my-secret"


def test_extract_raw_key_prefers_x_api_key_when_not_bearer_scheme() -> None:
    req = _http_request(
        [
            (b"authorization", b"Basic dGVzdA=="),
            (b"x-api-key", b"  key-from-header  "),
        ]
    )
    assert _extract_raw_key(req) == "key-from-header"


def test_extract_raw_key_bearer_without_space_falls_back_to_x_api_key() -> None:
    req = _http_request(
        [
            (b"authorization", b"Bearer"),
            (b"x-api-key", b"fallback"),
        ]
    )
    assert _extract_raw_key(req) == "fallback"


def test_extract_raw_key_empty_when_missing() -> None:
    req = _http_request([])
    assert _extract_raw_key(req) == ""


def test_require_mcp_editor_accepts_editor_level() -> None:
    kid, sid = uuid.uuid4(), uuid.uuid4()
    auth = McpAuth(key_row_id=kid, studio_id=sid, access_level="editor")
    out = require_mcp_editor(auth=auth)
    assert out is auth


def test_require_mcp_editor_rejects_viewer_level() -> None:
    kid, sid = uuid.uuid4(), uuid.uuid4()
    auth = McpAuth(key_row_id=kid, studio_id=sid, access_level="viewer")
    with pytest.raises(ApiError) as excinfo:
        require_mcp_editor(auth=auth)
    err = excinfo.value
    assert err.status_code == 403
    assert err.error_code == "FORBIDDEN"
