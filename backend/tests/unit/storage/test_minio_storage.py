"""Unit tests for StorageClient (mocked MinIO SDK)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from minio.error import S3Error

from app.storage.minio_storage import StorageClient


@pytest.mark.asyncio
async def test_ensure_bucket_creates_when_missing() -> None:
    mc = MagicMock()
    mc.bucket_exists.return_value = False
    sc = StorageClient(mc, "mybucket")
    await sc.ensure_bucket()
    mc.make_bucket.assert_called_once_with("mybucket")


@pytest.mark.asyncio
async def test_ensure_bucket_noop_when_exists() -> None:
    mc = MagicMock()
    mc.bucket_exists.return_value = True
    sc = StorageClient(mc, "b")
    await sc.ensure_bucket()
    mc.make_bucket.assert_not_called()


@pytest.mark.asyncio
async def test_put_bytes_calls_put_object() -> None:
    mc = MagicMock()
    sc = StorageClient(mc, "buck")
    await sc.put_bytes("key1", b"data", "text/plain")
    mc.put_object.assert_called_once()
    call_kw = mc.put_object.call_args
    assert call_kw[0][0] == "buck"
    assert call_kw[0][1] == "key1"


@pytest.mark.asyncio
async def test_get_bytes_reads_object() -> None:
    mc = MagicMock()
    resp = MagicMock()
    resp.read.return_value = b"payload"
    resp.close = MagicMock()
    resp.release_conn = MagicMock()
    mc.get_object.return_value = resp
    sc = StorageClient(mc, "buck")
    out = await sc.get_bytes("obj")
    assert out == b"payload"
    resp.close.assert_called_once()


@pytest.mark.asyncio
async def test_get_bytes_propagates_s3_error() -> None:
    mc = MagicMock()
    http_resp = MagicMock()
    mc.get_object.side_effect = S3Error(
        http_resp,
        "NoSuchKey",
        "m",
        "r",
        "",
        "",
        "b",
        "o",
    )
    sc = StorageClient(mc, "buck")
    with pytest.raises(S3Error):
        await sc.get_bytes("missing")


def test_iter_bytes_yields_chunks() -> None:
    mc = MagicMock()
    resp = MagicMock()
    resp.read.side_effect = [b"ab", b"cd", b""]
    resp.close = MagicMock()
    resp.release_conn = MagicMock()
    mc.get_object.return_value = resp
    sc = StorageClient(mc, "buck")
    parts = list(sc.iter_bytes("f"))
    assert parts == [b"ab", b"cd"]


def test_iter_bytes_raises_s3_error() -> None:
    mc = MagicMock()
    http_resp = MagicMock()
    mc.get_object.side_effect = S3Error(
        http_resp,
        "NoSuchKey",
        "m",
        "r",
        "",
        "",
        "b",
        "o",
    )
    sc = StorageClient(mc, "buck")
    with pytest.raises(S3Error):
        next(iter(sc.iter_bytes("missing")))


@pytest.mark.asyncio
async def test_remove_deletes_object() -> None:
    mc = MagicMock()
    sc = StorageClient(mc, "buck")
    await sc.remove("k")
    mc.remove_object.assert_called_once_with("buck", "k")


@pytest.mark.asyncio
async def test_copy_object_same_bucket() -> None:
    mc = MagicMock()
    sc = StorageClient(mc, "buck")
    await sc.copy_object("dest/key", "src/key")
    mc.copy_object.assert_called_once()
    args = mc.copy_object.call_args[0]
    assert args[0] == "buck"
    assert args[1] == "dest/key"
