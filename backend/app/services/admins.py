import logging

from sqlalchemy import func, select

from app.config import settings
from app.db import SessionLocal
from app.models import Admin
from app.security import hash_password

log = logging.getLogger(__name__)


async def ensure_bootstrap_admin() -> None:
    """Create the first owner account from ADMIN_USERNAME / ADMIN_PASSWORD when none exists."""
    async with SessionLocal() as session:
        count = await session.scalar(select(func.count()).select_from(Admin))
        if count:
            return
        if not settings.admin_password:
            log.warning("No admin account exists and ADMIN_PASSWORD is empty: nobody can log in yet")
            return
        session.add(
            Admin(
                username=settings.admin_username,
                password_hash=hash_password(settings.admin_password),
                role="owner",
            )
        )
        await session.commit()
        log.info("Created initial owner account '%s'", settings.admin_username)
