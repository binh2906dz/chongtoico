import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bots.manager import BotManager, InvalidBotToken, fetch_bot_identity
from app.db import get_session
from app.deps import current_admin, owner_required
from app.models import Bot as BotModel
from app.models import BotSubscriber

router = APIRouter(prefix="/api/bots", tags=["bots"])


class BotOut(BaseModel):
    id: int
    telegram_id: int
    username: str
    name: str
    token_hint: str
    is_active: bool
    running: bool
    subscribers: int
    created_at: datetime


class BotCreate(BaseModel):
    token: str = Field(min_length=20, max_length=128)


class BotUpdate(BaseModel):
    is_active: bool | None = None
    name: str | None = Field(default=None, max_length=128)


def _manager(request: Request) -> BotManager:
    return request.app.state.bot_manager


def _token_hint(token: str) -> str:
    head, _, tail = token.partition(":")
    return f"{head}:…{tail[-4:]}" if tail else "…"


async def _subscriber_counts(session: AsyncSession) -> dict[int, int]:
    rows = await session.execute(
        select(BotSubscriber.bot_id, func.count())
        .where(BotSubscriber.is_blocked.is_(False))
        .group_by(BotSubscriber.bot_id)
    )
    return {bot_id: count for bot_id, count in rows.all()}


def _bot_out(record: BotModel, manager: BotManager, subscribers: int) -> BotOut:
    return BotOut(
        id=record.id,
        telegram_id=record.telegram_id,
        username=record.username,
        name=record.name,
        token_hint=_token_hint(record.token),
        is_active=record.is_active,
        running=manager.is_running(record.id),
        subscribers=subscribers,
        created_at=record.created_at,
    )


async def _get_bot(session: AsyncSession, bot_id: int) -> BotModel:
    record = await session.get(BotModel, bot_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot không tồn tại")
    return record


@router.get("", response_model=list[BotOut], dependencies=[Depends(current_admin)])
async def list_bots(request: Request, session: AsyncSession = Depends(get_session)) -> list[BotOut]:
    records = (await session.scalars(select(BotModel).order_by(BotModel.id))).all()
    counts = await _subscriber_counts(session)
    manager = _manager(request)
    return [_bot_out(r, manager, counts.get(r.id, 0)) for r in records]


@router.post("", response_model=BotOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(owner_required)])
async def create_bot(body: BotCreate, request: Request, session: AsyncSession = Depends(get_session)) -> BotOut:
    token = body.token.strip()
    if await session.scalar(select(BotModel.id).where(BotModel.token == token)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Token này đã được thêm")
    try:
        identity = await fetch_bot_identity(token)
    except InvalidBotToken:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token không hợp lệ hoặc đã bị thu hồi")
    if await session.scalar(select(BotModel.id).where(BotModel.telegram_id == identity.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Bot @{identity.username} đã có trong hệ thống")

    record = BotModel(
        telegram_id=identity.id,
        username=identity.username or "",
        name=identity.full_name,
        token=token,
        webhook_secret=secrets.token_urlsafe(32),
        is_active=True,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)

    manager = _manager(request)
    await manager.start_bot(record)
    return _bot_out(record, manager, 0)


@router.patch("/{bot_id}", response_model=BotOut, dependencies=[Depends(owner_required)])
async def update_bot(
    bot_id: int, body: BotUpdate, request: Request, session: AsyncSession = Depends(get_session)
) -> BotOut:
    record = await _get_bot(session, bot_id)
    if body.name is not None:
        record.name = body.name.strip()
    if body.is_active is not None:
        record.is_active = body.is_active
    await session.commit()

    manager = _manager(request)
    if record.is_active and not manager.is_running(record.id):
        await manager.start_bot(record)
    elif not record.is_active and manager.is_running(record.id):
        await manager.stop_bot(record.id)
    counts = await _subscriber_counts(session)
    return _bot_out(record, manager, counts.get(record.id, 0))


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(owner_required)])
async def delete_bot(bot_id: int, request: Request, session: AsyncSession = Depends(get_session)) -> None:
    record = await _get_bot(session, bot_id)
    await _manager(request).stop_bot(record.id)
    await session.delete(record)
    await session.commit()
