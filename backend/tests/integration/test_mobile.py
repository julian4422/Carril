"""v1.2 (móvil): CORS en los errores 500/503 y compresión GZip."""
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db.session import get_session
from tests.integration.conftest import add_task

A = "/api/v1"
EVIL = "https://evil.example"
GZIP = {"Accept-Encoding": "gzip"}
LOGIN = {"email": "a@b.co", "password": "12345678"}


def allowed_origin() -> str:
    return get_settings().cors_origins_list[0]


def _failing_client(app, exc) -> AsyncClient:
    class Broken:
        async def execute(self, *a, **k):
            raise exc

        async def scalar(self, *a, **k):
            raise exc

    async def _broken():
        yield Broken()

    app.dependency_overrides[get_session] = _broken
    # raise_app_exceptions=True (por defecto): si la excepción escapara de la app, la prueba fallaría.
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


ERRORS = [
    (RuntimeError("boom"), 500, "Error interno"),
    (OperationalError("s", {}, Exception("conn")), 503, "Base de datos no disponible"),
]


@pytest.mark.parametrize("exc,status,detail", ERRORS)
async def test_error_with_allowed_origin_has_cors(app, exc, status, detail):
    async with _failing_client(app, exc) as c:
        r = await c.post(f"{A}/auth/login", json=LOGIN, headers={"Origin": allowed_origin()})
    assert r.status_code == status and r.json() == {"detail": detail}
    assert r.headers["content-type"].startswith("application/json")
    assert r.headers["access-control-allow-origin"] == allowed_origin()
    assert "Origin" in r.headers.get("vary", "")


@pytest.mark.parametrize("exc,status,detail", ERRORS)
async def test_error_with_disallowed_origin_has_no_cors(app, exc, status, detail):
    async with _failing_client(app, exc) as c:
        r = await c.post(f"{A}/auth/login", json=LOGIN, headers={"Origin": EVIL})
    assert r.status_code == status and r.json() == {"detail": detail}
    assert "access-control-allow-origin" not in r.headers


async def test_error_without_origin_has_no_cors(app):
    async with _failing_client(app, RuntimeError("boom")) as c:
        r = await c.post(f"{A}/auth/login", json=LOGIN)
    assert r.status_code == 500 and "access-control-allow-origin" not in r.headers


async def test_domain_error_keeps_cors(client):
    r = await client.get(f"{A}/boards", headers={"Origin": allowed_origin()})
    assert r.status_code == 401
    assert r.headers["access-control-allow-origin"] == allowed_origin()


async def _big_board(client, ana, board) -> None:
    for i in range(15):
        await add_task(client, ana["headers"], board["columns"][0]["id"], f"Tarea {i}", description="x" * 80)


async def test_large_board_is_gzipped_with_cors(client, ana, board):
    await _big_board(client, ana, board)
    r = await client.get(f"{A}/boards/{board['id']}", headers={**ana["headers"], **GZIP, "Origin": allowed_origin()})
    assert r.status_code == 200
    assert r.headers["content-encoding"] == "gzip"
    assert int(r.headers["content-length"]) < len(r.content)  # httpx descomprime; el JSON real es mayor
    assert len(r.json()["columns"][0]["tasks"]) == 15
    assert r.headers["access-control-allow-origin"] == allowed_origin()
    vary = r.headers["vary"]
    assert "Accept-Encoding" in vary and "Origin" in vary


async def test_large_board_without_gzip_support_is_not_compressed(client, ana, board):
    await _big_board(client, ana, board)
    r = await client.get(f"{A}/boards/{board['id']}", headers={**ana["headers"], "Accept-Encoding": "identity"})
    assert r.status_code == 200 and len(r.content) >= 1000
    assert "content-encoding" not in r.headers


async def test_small_response_is_not_gzipped(client):
    r = await client.get(f"{A}/health", headers=GZIP)
    assert r.status_code == 200 and len(r.content) < 1000
    assert "content-encoding" not in r.headers


async def test_preflight_still_works(client):
    r = await client.options(f"{A}/boards", headers={
        "Origin": allowed_origin(), "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == allowed_origin()
