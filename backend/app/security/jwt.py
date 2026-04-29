"""JWT access tokens."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from app.config import get_settings


def create_access_token(user_id: UUID) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> UUID:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ValueError("invalid token") from exc
    sub = payload.get("sub")
    if not sub:
        raise ValueError("invalid token")
    return UUID(str(sub))
