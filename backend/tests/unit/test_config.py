import pytest
from pydantic import ValidationError

from app.core.config import Settings

GOOD = "a" * 32


@pytest.mark.parametrize("bad", ["", "short", "x" * 31, "change-me-in-production", "secret", "changeme", "CHANGEME"])
def test_weak_jwt_secret_rejected(bad):
    with pytest.raises(ValidationError):
        Settings(jwt_secret=bad)


def test_missing_jwt_secret_rejected(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings()


def test_valid_secret_and_cors_list():
    s = Settings(jwt_secret=GOOD, cors_origins="http://a.dev, http://b.dev ,")
    assert s.jwt_secret == GOOD and s.cors_origins_list == ["http://a.dev", "http://b.dev"]


def test_whitespace_required_text_rejected():
    from app.schemas.tasks import CommentCreate

    with pytest.raises(ValidationError):
        CommentCreate(body="   ")
    assert CommentCreate(body="  hola ").body == "hola"


# get_settings: arranque con un mensaje legible en lugar de una traza de pydantic


@pytest.fixture
def fresh_settings():
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield get_settings
    get_settings.cache_clear()


@pytest.mark.parametrize("secret", ["corto", "change-me-in-production"])
def test_get_settings_invalid_secret_exits_with_readable_message(monkeypatch, fresh_settings, secret):
    monkeypatch.setenv("JWT_SECRET", secret)
    with pytest.raises(SystemExit) as exc:
        fresh_settings()
    message = str(exc.value)
    assert message.startswith("[carril] Configuración inválida: JWT_SECRET: ")
    assert "openssl rand -hex 32" in message
    assert secret not in message


def test_get_settings_missing_secret_exits_with_readable_message(monkeypatch, fresh_settings):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(SystemExit) as exc:
        fresh_settings()
    assert "JWT_SECRET" in str(exc.value)


def test_get_settings_valid_secret_loads(monkeypatch, fresh_settings):
    monkeypatch.setenv("JWT_SECRET", GOOD)
    assert fresh_settings().jwt_secret == GOOD
