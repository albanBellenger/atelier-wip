"""Application configuration via environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings — loaded from environment / `.env` when present."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "dev"  # set to "production" in production .env
    expose_internal_error_detail: bool = Field(
        default=False,
        validation_alias="ATELIER_EXPOSE_INTERNAL_ERRORS",
    )
    log_llm_prompts: bool = Field(
        default=False,
        validation_alias="ATELIER_LOG_LLM_PROMPTS",
        description="When True, include full chat messages in llm_outbound_request logs (PII risk).",
    )
    database_url: str = "postgresql+asyncpg://atelier:atelier@localhost:5432/atelier"
    jwt_secret: str = "changeme-use-a-long-random-string"
    jwt_expire_minutes: int = 10080
    secure_cookies: bool = False
    encryption_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # MinIO (S3-compatible). When backend runs on host, use localhost:9000.
    minio_endpoint: str = "127.0.0.1:9000"
    minio_root_user: str = "atelier"
    minio_root_password: str = "atelierdev"
    minio_bucket: str = "atelier-artifacts"
    minio_use_ssl: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    codebase_index_max_files: int = Field(
        default=5000,
        validation_alias="ATELIER_CODEBASE_INDEX_MAX_FILES",
    )
    codebase_index_max_total_bytes: int = Field(
        default=52_428_800,
        validation_alias="ATELIER_CODEBASE_INDEX_MAX_TOTAL_BYTES",
        description="Soft cap on total raw bytes indexed per snapshot (~50 MiB default).",
    )
    codebase_index_max_file_bytes: int = Field(
        default=1_048_576,
        validation_alias="ATELIER_CODEBASE_INDEX_MAX_FILE_BYTES",
        description="Skip individual blobs larger than this (default 1 MiB).",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
