"""Authentication routes."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter  # noqa: F401
from slowapi.util import get_remote_address  # noqa: F401

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.main import limiter
from app.models import User
from app.schemas.auth import MeResponse, UserCreate, UserLogin, UserProfilePatch
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: JSONResponse, token: str) -> JSONResponse:
    settings = get_settings()
    response.set_cookie(
        key="atelier_token",
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        path="/",
    )
    return response


def _clear_auth_cookie(response: JSONResponse) -> JSONResponse:
    settings = get_settings()
    response.set_cookie(
        key="atelier_token",
        value="",
        max_age=0,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        path="/",
    )
    return response


@router.post("/register")
@limiter.limit("10/minute")
async def register(
    request: Request,
    body: UserCreate,
    session: AsyncSession = Depends(get_db),
) -> JSONResponse:
    token = await AuthService(session).register(body)
    response = JSONResponse(content={"message": "ok"})
    return _set_auth_cookie(response, token)


@router.post("/login")
@limiter.limit("20/minute")
async def login(
    request: Request,
    body: UserLogin,
    session: AsyncSession = Depends(get_db),
) -> JSONResponse:
    token = await AuthService(session).login(body.email, body.password)
    response = JSONResponse(content={"message": "ok"})
    return _set_auth_cookie(response, token)


@router.post("/logout")
async def logout() -> JSONResponse:
    response = JSONResponse(content={"message": "ok"})
    return _clear_auth_cookie(response)


@router.get("/me", response_model=MeResponse)
async def me(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeResponse:
    return await AuthService(session).me(user)


@router.patch("/me", response_model=MeResponse)
async def patch_me(
    body: UserProfilePatch,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeResponse:
    return await AuthService(session).patch_profile(user, body)
