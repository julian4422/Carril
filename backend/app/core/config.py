from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SECRET_LENGTH = 32
WEAK_SECRETS = {"change-me-in-production", "secret", "changeme", "change-me"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+asyncpg://carril:carril@localhost:5432/carril"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 720
    cors_origins: str = "http://localhost:4200"
    bcrypt_rounds: int = 12

    @field_validator("jwt_secret")
    @classmethod
    def _strong_secret(cls, value: str) -> str:
        if len(value) < MIN_SECRET_LENGTH or value.strip().lower() in WEAK_SECRETS:
            raise ValueError(
                f"JWT_SECRET debe tener al menos {MIN_SECRET_LENGTH} caracteres y no ser un valor de ejemplo "
                "(genera uno con `openssl rand -hex 32`)"
            )
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
