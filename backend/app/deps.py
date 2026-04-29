"""FastAPI dependencies: database session, JWT user, RBAC."""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import AppError
from app.models import User
from app.services.auth_service import AuthService

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if creds is None or not creds.credentials:
        raise AppError(code="UNAUTHORIZED", message="Not authenticated", status_code=401)
    return await AuthService.get_user_from_token(session, creds.credentials)


async def require_tool_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_tool_admin:
        raise AppError(code="FORBIDDEN", message="Tool admin access required", status_code=403)
    return user
