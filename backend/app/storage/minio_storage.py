"""MinIO client wrapper — sync SDK calls offloaded with asyncio.to_thread."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from functools import lru_cache
from io import BytesIO

from minio import Minio
from minio.commonconfig import CopySource
from minio.error import S3Error

from app.config import get_settings


class StorageClient:
    """Thin wrapper around MinIO with blocking calls run in a thread pool."""

    def __init__(self, client: Minio, bucket: str) -> None:
        self._client = client
        self.bucket = bucket

    async def ensure_bucket(self) -> None:
        def _run() -> None:
            found = self._client.bucket_exists(self.bucket)
            if not found:
                self._client.make_bucket(self.bucket)

        await asyncio.to_thread(_run)

    async def put_bytes(
        self, object_name: str, data: bytes, content_type: str
    ) -> None:
        def _run() -> None:
            self._client.put_object(
                self.bucket,
                object_name,
                BytesIO(data),
                length=len(data),
                content_type=content_type,
            )

        await asyncio.to_thread(_run)

    async def get_bytes(self, object_name: str) -> bytes:
        def _run() -> bytes:
            try:
                resp = self._client.get_object(self.bucket, object_name)
                try:
                    return resp.read()
                finally:
                    resp.close()
                    resp.release_conn()
            except S3Error:
                raise

        return await asyncio.to_thread(_run)

    def iter_bytes(self, object_name: str) -> Iterator[bytes]:
        """Sync iterator for StreamingResponse (run in threadpool from route)."""
        try:
            resp = self._client.get_object(self.bucket, object_name)
            try:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    yield chunk
            finally:
                resp.close()
                resp.release_conn()
        except S3Error:
            raise

    async def remove(self, object_name: str) -> None:
        def _run() -> None:
            self._client.remove_object(self.bucket, object_name)

        await asyncio.to_thread(_run)

    async def copy_object(self, dest_object_name: str, src_object_name: str) -> None:
        """Copy an object within the same bucket (used when moving artifact storage prefix)."""

        def _run() -> None:
            self._client.copy_object(
                self.bucket,
                dest_object_name,
                CopySource(self.bucket, src_object_name),
            )

        await asyncio.to_thread(_run)


@lru_cache
def get_storage_client() -> StorageClient:
    settings = get_settings()
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_root_user,
        secret_key=settings.minio_root_password,
        secure=settings.minio_use_ssl,
    )
    return StorageClient(client, settings.minio_bucket)
