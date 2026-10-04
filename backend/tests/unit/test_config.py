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
