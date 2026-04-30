"""S3-compatible object storage (MinIO)."""

from app.storage.minio_storage import StorageClient, get_storage_client

__all__ = ["StorageClient", "get_storage_client"]
