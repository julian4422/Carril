from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core import security
from app.core.errors import UnauthorizedError

SECRET = "unit-test-secret-unit-test-secret-0123"


def test_hash_and_verify():
    h = security.hash_password("clave-segura", rounds=4)
    assert h != "clave-segura" and h.startswith("$2")
    assert security.verify_password("clave-segura", h)
    assert not security.verify_password("otra-clave", h)


def test_hash_is_salted():
    assert security.hash_password("x" * 8, 4) != security.hash_password("x" * 8, 4)


def test_verify_garbage_hash_is_false():
    assert security.verify_password("a", "no-es-un-hash") is False


def test_verify_seed_hash():
    seed = "$2b$12$5Jytj4Xbn63UZ2doQWGUve.08..sOzJyLn3M/hGdpQtznEs1jfDk2"
    assert security.verify_password("demo1234", seed)


def test_long_password_truncated_not_crashing():
    h = security.hash_password("é" * 100, rounds=4)
    assert security.verify_password("é" * 100, h)


def test_jwt_roundtrip():
    token = security.create_access_token("user-1", SECRET, 5)
    assert security.decode_access_token(token, SECRET) == "user-1"


def test_jwt_expired():
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    token = security.create_access_token("u", SECRET, 1, now=past)
    with pytest.raises(UnauthorizedError, match="expirado"):
        security.decode_access_token(token, SECRET)


def test_jwt_bad_signature():
    token = security.create_access_token("u", "otro-secreto-otro-secreto-otro-secreto-1", 5)
    with pytest.raises(UnauthorizedError, match="inválido"):
        security.decode_access_token(token, SECRET)


def test_jwt_malformed_and_missing_claims():
    with pytest.raises(UnauthorizedError):
        security.decode_access_token("no.es.jwt", SECRET)
    no_sub = jwt.encode({"exp": 9999999999}, SECRET, algorithm="HS256")
    with pytest.raises(UnauthorizedError):
        security.decode_access_token(no_sub, SECRET)


def test_jwt_alg_none_rejected():
    token = jwt.encode({"sub": "u", "exp": 9999999999}, None, algorithm="none")
    with pytest.raises(UnauthorizedError):
        security.decode_access_token(token, SECRET)
