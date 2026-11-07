from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import current_admin
from app.models import Bot as BotModel
from app.models import BotSubscriber, TelegramUser

router = APIRouter(prefix="/api", tags=["stats"])


class StatsOut(BaseModel):
    bots_total: int
    bots_active: int
    bots_running: int
    users_total: int
    subscriptions_active: int
    subscriptions_blocked: int


@router.get("/stats", response_model=StatsOut, dependencies=[Depends(current_admin)])
async def stats(request: Request, session: AsyncSession = Depends(get_session)) -> StatsOut:
    async def count(stmt) -> int:
        return int(await session.scalar(stmt) or 0)

    return StatsOut(
        bots_total=await count(select(func.count()).select_from(BotModel)),
        bots_active=await count(select(func.count()).select_from(BotModel).where(BotModel.is_active.is_(True))),
        bots_running=request.app.state.bot_manager.running_count,
        users_total=await count(select(func.count()).select_from(TelegramUser)),
        subscriptions_active=await count(
            select(func.count()).select_from(BotSubscriber).where(BotSubscriber.is_blocked.is_(False))
        ),
        subscriptions_blocked=await count(
            select(func.count()).select_from(BotSubscriber).where(BotSubscriber.is_blocked.is_(True))
        ),
    )
