import pytest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from httpx import ASGITransport, AsyncClient

from app.core.errors import UnhandledErrorMiddleware
from app.main import GZIP_MINIMUM_SIZE, create_app


def test_middleware_order_and_gzip_config():
    app = create_app()
    # user_middleware va de fuera hacia dentro
    assert [m.cls for m in app.user_middleware] == [GZipMiddleware, CORSMiddleware, UnhandledErrorMiddleware]
    assert GZIP_MINIMUM_SIZE == 1000
    assert app.user_middleware[0].kwargs["minimum_size"] == GZIP_MINIMUM_SIZE


async def _boom_app(scope, receive, send):
    raise RuntimeError("boom")


async def test_unhandled_error_becomes_json_500():
    mw = UnhandledErrorMiddleware(_boom_app)
    async with AsyncClient(transport=ASGITransport(app=mw), base_url="http://t") as c:
        r = await c.get("/")
    assert r.status_code == 500 and r.json() == {"detail": "Error interno"}


async def test_error_after_response_started_is_reraised():
    async def started_then_boom(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        raise RuntimeError("tarde")

    mw = UnhandledErrorMiddleware(started_then_boom)
    async with AsyncClient(transport=ASGITransport(app=mw), base_url="http://t") as c:
        with pytest.raises(RuntimeError, match="tarde"):
            await c.get("/")


async def test_non_http_scope_passes_through():
    seen = []

    async def inner(scope, receive, send):
        seen.append(scope["type"])

    await UnhandledErrorMiddleware(inner)({"type": "lifespan"}, None, None)
    assert seen == ["lifespan"]
