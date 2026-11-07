from aiogram import F, Router
from aiogram.enums import ChatMemberStatus, ChatType
from aiogram.filters import CommandStart
from aiogram.types import ChatMemberUpdated, Message

from app.services.subscribers import record_subscriber, set_blocked

router = Router(name="core")


@router.message(CommandStart())
async def on_start(message: Message, bot_db_id: int) -> None:
    if message.from_user:
        await record_subscriber(bot_db_id, message.from_user)
    await message.answer("Xin chào! 👋 Hệ thống đang được xây dựng, quay lại sau nhé.")


@router.my_chat_member(F.chat.type == ChatType.PRIVATE)
async def on_block_change(event: ChatMemberUpdated, bot_db_id: int) -> None:
    blocked = event.new_chat_member.status == ChatMemberStatus.KICKED
    await set_blocked(bot_db_id, event.from_user, blocked)
