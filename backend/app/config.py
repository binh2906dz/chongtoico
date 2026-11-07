from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    domain: str = "localhost"
    public_url: str = ""

    database_url: str = "postgresql+asyncpg://chongtoico:chongtoico@localhost:5432/chongtoico"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = ""
    admin_username: str = "admin"
    admin_password: str = ""

    cookie_secure: bool = True
    session_days: int = 7
    login_max_attempts: int = 10
    login_window_seconds: int = 300

    @property
    def base_url(self) -> str:
        """Public HTTPS origin used for Telegram webhooks; empty when running locally."""
        if self.public_url:
            return self.public_url.rstrip("/")
        if self.domain and self.domain != "localhost":
            return f"https://{self.domain}"
        return ""


settings = Settings()
