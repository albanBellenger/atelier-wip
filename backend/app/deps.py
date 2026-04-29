"""FastAPI dependencies: database session, JWT user, RBAC."""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ApiError
from app.models import User
from app.services.auth_service import AuthService

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if creds is None or not creds.credentials:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Not authenticated",
        )
    return await AuthService(session).get_user_from_token(creds.credentials)


async def require_tool_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_tool_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Tool admin access required",
        )
    return user
