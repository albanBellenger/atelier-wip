"""Structured JSON for unexpected server errors."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_unhandled_exception_returns_json_with_internal_error_code(
    client: AsyncClient,
) -> None:
    r = await client.get("/__pytest_probe_internal_error")
    assert r.status_code == 500
    body = r.json()
    assert body.get("code") == "INTERNAL_ERROR"
    assert isinstance(body.get("detail"), str)
    assert len(body["detail"]) > 0
