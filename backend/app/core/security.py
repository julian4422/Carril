from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.errors import UnauthorizedError

_MAX_BCRYPT_BYTES = 72


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:_MAX_BCRYPT_BYTES]


def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt(rounds=rounds)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("ascii"))
    except ValueError:
        return False


def create_access_token(
    subject: str,
    secret: str,
    expires_minutes: int,
    algorithm: str = "HS256",
    now: datetime | None = None,
) -> str:
    now = now or datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_access_token(token: str, secret: str, algorithm: str = "HS256") -> str:
    """Devuelve el `sub` o lanza UnauthorizedError (expirado, firma inválida, malformado)."""
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm], options={"require": ["exp", "sub"]})
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Token expirado") from None
    except jwt.PyJWTError:
        raise UnauthorizedError("Token inválido") from None
    return str(payload["sub"])
