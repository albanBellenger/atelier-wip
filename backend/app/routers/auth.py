"""Authentication routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import MeResponse, TokenResponse, UserCreate, UserLogin
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(
    body: UserCreate,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await AuthService(session).register(body)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await AuthService(session).login(body.email, body.password)


@router.get("/me", response_model=MeResponse)
async def me(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeResponse:
    return await AuthService(session).me(user)
