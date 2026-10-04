import jwt
import pytest

from app.db.session import get_session
from tests.integration.conftest import make_user

A = "/api/v1"


async def test_health_ok(client):
    r = await client.get(f"{A}/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


async def test_health_503_when_db_down(app, client):
    class Broken:
        async def execute(self, *a, **k):
            raise RuntimeError("db down")

    async def _broken():
        yield Broken()

    app.dependency_overrides[get_session] = _broken
    r = await client.get(f"{A}/health")
    assert r.status_code == 503
    assert r.json()["database"] == "error"


async def test_register_and_login_flow(client):
    r = await client.post(f"{A}/auth/register", json={"email": "Zed@Carril-Test.dev", "full_name": " Zed ", "password": "password1"})
    assert r.status_code == 201
    body = r.json()
    assert body["full_name"] == "Zed" and "password" not in body and "password_hash" not in body
    r = await client.post(f"{A}/auth/login", json={"email": "zed@carril-test.dev", "password": "password1"})
    assert r.status_code == 200
    tok = r.json()
    assert tok["token_type"] == "bearer" and tok["expires_in"] == 720 * 60 and tok["user"]["id"] == body["id"]
    me = await client.get(f"{A}/auth/me", headers={"Authorization": f"Bearer {tok['access_token']}"})
    assert me.status_code == 200 and me.json()["id"] == body["id"]


async def test_register_duplicate_email_case_insensitive_409(client):
    payload = {"email": "dup@carril-test.dev", "full_name": "D", "password": "password1"}
    assert (await client.post(f"{A}/auth/register", json=payload)).status_code == 201
    r = await client.post(f"{A}/auth/register", json={**payload, "email": "DUP@carril-test.dev"})
    assert r.status_code == 409
    assert "detail" in r.json()


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "x@carril-test.dev", "full_name": "X", "password": "short"},
        {"email": "not-an-email", "full_name": "X", "password": "password1"},
        {"email": "x@carril-test.dev", "full_name": "", "password": "password1"},
        {"full_name": "X", "password": "password1"},
    ],
)
async def test_register_422(client, payload):
    assert (await client.post(f"{A}/auth/register", json=payload)).status_code == 422


async def test_login_invalid_credentials_401(client, ana):
    r = await client.post(f"{A}/auth/login", json={"email": ana["email"], "password": "wrong-pass"})
    assert r.status_code == 401
    r = await client.post(f"{A}/auth/login", json={"email": "nadie@carril-test.dev", "password": "whatever1"})
    assert r.status_code == 401


async def test_protected_routes_401(client, ana):
    for h in (None, {"Authorization": "Bearer garbage"}, {"Authorization": "Basic abc"}):
        r = await client.get(f"{A}/boards", headers=h)
        assert r.status_code == 401
    expired = jwt.encode({"sub": ana["user"]["id"], "exp": 1}, "test-secret-test-secret-test-secret-0123", algorithm="HS256")
    r = await client.get(f"{A}/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and r.json()["detail"] == "Token expirado"


async def test_token_for_unknown_user_or_bad_sub_401(client):
    import uuid

    ghost = jwt.encode({"sub": str(uuid.uuid4()), "exp": 9999999999}, "test-secret-test-secret-test-secret-0123", algorithm="HS256")
    assert (await client.get(f"{A}/auth/me", headers={"Authorization": f"Bearer {ghost}"})).status_code == 401
    bad = jwt.encode({"sub": "no-uuid", "exp": 9999999999}, "test-secret-test-secret-test-secret-0123", algorithm="HS256")
    assert (await client.get(f"{A}/auth/me", headers={"Authorization": f"Bearer {bad}"})).status_code == 401


async def test_cors_preflight(client):
    r = await client.options(
        f"{A}/boards",
        headers={"Origin": "http://localhost:4200", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:4200"
