import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.bots.manager import BotManager, build_dispatcher
from app.config import settings
from app.db import engine
from app.redis_client import redis
from app.routers import auth, bots, stats, webhook
from app.services.admins import ensure_bootstrap_admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# aiohttp/aiogram request logs can include the bot token in the URL path.
logging.getLogger("aiohttp.access").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.secret_key:
        raise RuntimeError("SECRET_KEY is not set in .env")

    await ensure_bootstrap_admin()
    dispatcher = build_dispatcher()
    manager = BotManager(dispatcher, settings.base_url)
    app.state.bot_manager = manager
    await manager.start_all()
    try:
        yield
    finally:
        await manager.shutdown()
        await dispatcher.storage.close()
        await redis.aclose()
        await engine.dispose()


app = FastAPI(
    title="Chongtoico API",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

app.include_router(auth.router)
app.include_router(bots.router)
app.include_router(stats.router)
app.include_router(webhook.router)


@app.get("/api/health", tags=["health"])
async def health() -> dict:
    return {"ok": True}
