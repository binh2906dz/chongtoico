from fastapi import APIRouter, Header, Request, Response, status

from app.bots.manager import DispatchResult

router = APIRouter(tags=["telegram"])


@router.post("/tg/webhook/{bot_id}", include_in_schema=False)
async def telegram_webhook(
    bot_id: int,
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> Response:
    try:
        payload = await request.json()
    except ValueError:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)
    if not isinstance(payload, dict):
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    result = request.app.state.bot_manager.dispatch(bot_id, x_telegram_bot_api_secret_token, payload)
    if result is DispatchResult.FORBIDDEN:
        return Response(status_code=status.HTTP_403_FORBIDDEN)
    # Unknown/disabled bots and malformed updates still get 200 so Telegram stops retrying them.
    return Response(status_code=status.HTTP_200_OK)
