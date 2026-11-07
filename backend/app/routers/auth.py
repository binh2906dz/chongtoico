from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.deps import SESSION_COOKIE, current_admin
from app.models import Admin
from app.redis_client import redis
from app.security import DUMMY_PASSWORD_HASH, create_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class AdminOut(BaseModel):
    id: int
    username: str
    role: str


def _admin_out(admin: Admin) -> AdminOut:
    return AdminOut(id=admin.id, username=admin.username, role=admin.role)


@router.post("/login", response_model=AdminOut)
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> AdminOut:
    ip = request.client.host if request.client else "unknown"
    key = f"login_attempts:{ip}"
    attempts = await redis.incr(key)
    if attempts == 1:
        await redis.expire(key, settings.login_window_seconds)
    if attempts > settings.login_max_attempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Đăng nhập sai quá nhiều lần, thử lại sau ít phút")

    admin = await session.scalar(select(Admin).where(Admin.username == body.username.strip()))
    password_ok = verify_password(body.password, admin.password_hash if admin else DUMMY_PASSWORD_HASH)
    if admin is None or not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai tên đăng nhập hoặc mật khẩu")

    await redis.delete(key)
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(admin.id, admin.role),
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return _admin_out(admin)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=AdminOut)
async def me(admin: Admin = Depends(current_admin)) -> AdminOut:
    return _admin_out(admin)
