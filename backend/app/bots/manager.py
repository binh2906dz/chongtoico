import asyncio
import contextlib
import enum
import hmac
import logging
from dataclasses import dataclass

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError, TelegramUnauthorizedError
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import Update, User
from aiogram.utils.token import TokenValidationError
from pydantic import ValidationError
from sqlalchemy import select

from app.bots import handlers
from app.config import settings
from app.db import SessionLocal
from app.models import Bot as BotModel

log = logging.getLogger(__name__)


class InvalidBotToken(Exception):
    pass


class DispatchResult(enum.Enum):
    ACCEPTED = "accepted"
    UNKNOWN_BOT = "unknown_bot"
    FORBIDDEN = "forbidden"
    INVALID = "invalid"


@dataclass
class _RunningBot:
    bot: Bot
    secret: str


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    dp.include_router(handlers.router)
    return dp


def _new_bot(token: str) -> Bot:
    return Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))


async def fetch_bot_identity(token: str) -> User:
    """Ask Telegram who owns this token; raises InvalidBotToken if it is rejected."""
    try:
        bot = _new_bot(token)
    except TokenValidationError as exc:
        raise InvalidBotToken from exc
    try:
        return await bot.get_me()
    except TelegramUnauthorizedError as exc:
        raise InvalidBotToken from exc
    finally:
        await bot.session.close()


class BotManager:
    """Keeps one live aiogram Bot per active DB row and routes webhook updates to them."""

    def __init__(self, dispatcher: Dispatcher, base_url: str):
        self.dp = dispatcher
        self.base_url = base_url
        self._bots: dict[int, _RunningBot] = {}
        self._tasks: set[asyncio.Task] = set()

    def webhook_url(self, bot_id: int) -> str:
        return f"{self.base_url}/tg/webhook/{bot_id}"

    def is_running(self, bot_id: int) -> bool:
        return bot_id in self._bots

    @property
    def running_count(self) -> int:
        return len(self._bots)

    async def start_bot(self, record: BotModel) -> bool:
        await self.stop_bot(record.id, delete_webhook=False)
        try:
            bot = _new_bot(record.token)
        except TokenValidationError:
            log.error("Bot id=%s has a malformed token; not started", record.id)
            return False

        if self.base_url:
            try:
                await bot.set_webhook(
                    self.webhook_url(record.id),
                    secret_token=record.webhook_secret,
                    allowed_updates=self.dp.resolve_used_update_types(),
                )
            except TelegramUnauthorizedError:
                log.error("Bot id=%s @%s: token rejected by Telegram (revoked or banned)", record.id, record.username)
                await bot.session.close()
                return False
            except TelegramAPIError as exc:
                log.error("Bot id=%s @%s: set_webhook failed (%s)", record.id, record.username, type(exc).__name__)
                await bot.session.close()
                return False
        else:
            log.warning("DOMAIN/PUBLIC_URL not set: webhook not registered for bot id=%s", record.id)

        self._bots[record.id] = _RunningBot(bot=bot, secret=record.webhook_secret)
        log.info("Bot id=%s @%s started", record.id, record.username)
        return True

    async def stop_bot(self, bot_id: int, delete_webhook: bool = True) -> None:
        running = self._bots.pop(bot_id, None)
        if running is None:
            return
        if delete_webhook:
            with contextlib.suppress(TelegramAPIError):
                await running.bot.delete_webhook()
        await running.bot.session.close()
        log.info("Bot id=%s stopped", bot_id)

    async def start_all(self) -> None:
        async with SessionLocal() as session:
            records = (await session.scalars(select(BotModel).where(BotModel.is_active.is_(True)))).all()
        for record in records:
            await self.start_bot(record)
        log.info("BotManager: %d/%d active bots running", self.running_count, len(records))

    async def shutdown(self) -> None:
        # Keep webhooks registered so Telegram queues updates while the container restarts.
        for bot_id in list(self._bots):
            await self.stop_bot(bot_id, delete_webhook=False)

    def dispatch(self, bot_id: int, secret: str | None, payload: dict) -> DispatchResult:
        running = self._bots.get(bot_id)
        if running is None:
            return DispatchResult.UNKNOWN_BOT
        if not secret or not hmac.compare_digest(secret, running.secret):
            return DispatchResult.FORBIDDEN
        try:
            update = Update.model_validate(payload, context={"bot": running.bot})
        except ValidationError:
            log.warning("Bot id=%s: received malformed update", bot_id)
            return DispatchResult.INVALID

        task = asyncio.create_task(self._process(running.bot, bot_id, update))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return DispatchResult.ACCEPTED

    async def _process(self, bot: Bot, bot_id: int, update: Update) -> None:
        try:
            await self.dp.feed_update(bot, update, bot_db_id=bot_id)
        except Exception:
            log.exception("Bot id=%s: failed to process update %s", bot_id, update.update_id)
