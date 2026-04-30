"""Application configuration via environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings — loaded from environment / `.env` when present."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "dev"  # set to "production" in production .env
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
