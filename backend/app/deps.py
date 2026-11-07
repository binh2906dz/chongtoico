from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Admin
from app.security import decode_session_token

SESSION_COOKIE = "ct_session"


async def current_admin(request: Request, session: AsyncSession = Depends(get_session)) -> Admin:
    token = request.cookies.get(SESSION_COOKIE)
    payload = decode_session_token(token) if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    try:
        admin_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ")
    admin = await session.get(Admin, admin_id)
    if admin is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không còn tồn tại")
    return admin


async def owner_required(admin: Admin = Depends(current_admin)) -> Admin:
    if admin.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ chủ hệ thống mới được thao tác này")
    return admin
