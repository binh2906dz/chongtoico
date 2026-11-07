from aiogram.types import User
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import SessionLocal
from app.models import BotSubscriber, TelegramUser


def _upsert_user_stmt(user: User):
    values = {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "language_code": user.language_code,
    }
    stmt = pg_insert(TelegramUser).values(**values)
    return stmt.on_conflict_do_update(
        index_elements=[TelegramUser.id],
        set_={**{k: stmt.excluded[k] for k in values if k != "id"}, "updated_at": func.now()},
    )


async def record_subscriber(bot_id: int, user: User) -> None:
    """Upsert the Telegram profile and link it to this bot (un-blocks on a fresh /start)."""
    async with SessionLocal() as session:
        await session.execute(_upsert_user_stmt(user))
        link = pg_insert(BotSubscriber).values(bot_id=bot_id, user_id=user.id, is_blocked=False)
        await session.execute(
            link.on_conflict_do_update(
                index_elements=[BotSubscriber.bot_id, BotSubscriber.user_id],
                set_={"is_blocked": False},
            )
        )
        await session.commit()


async def set_blocked(bot_id: int, user: User, blocked: bool) -> None:
    async with SessionLocal() as session:
        await session.execute(_upsert_user_stmt(user))
        link = pg_insert(BotSubscriber).values(bot_id=bot_id, user_id=user.id, is_blocked=blocked)
        await session.execute(
            link.on_conflict_do_update(
                index_elements=[BotSubscriber.bot_id, BotSubscriber.user_id],
                set_={"is_blocked": blocked},
            )
        )
        await session.commit()
