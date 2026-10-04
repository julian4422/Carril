import os
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.db.session import get_session
from app.main import create_app

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql+asyncpg://carril:carril@localhost:5432/carril_test"
)
# TRUNCATE ... CASCADE (no DELETE de usuarios): evita ForeignKeyViolation por CASCADE+SET NULL mezclados.
TRUNCATE = "TRUNCATE users, boards, board_columns, tasks, labels, task_labels, task_comments CASCADE"


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        async with eng.begin() as conn:
            await conn.execute(text(TRUNCATE))
    except Exception as exc:  # BD no disponible
        await eng.dispose()
        pytest.skip(f"BD de pruebas no disponible ({TEST_DATABASE_URL}): {exc}")
    yield eng
    async with eng.begin() as conn:
        await conn.execute(text(TRUNCATE))
    await eng.dispose()


@pytest.fixture
def app(engine):
    application = create_app()
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _session():
        async with maker() as session:
            yield session

    application.dependency_overrides[get_session] = _session
    return application


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db(engine):
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session


async def make_user(client: AsyncClient, name: str = "Ana") -> dict:
    email = f"{name.lower()}-{uuid.uuid4().hex[:8]}@carril-test.dev"
    r = await client.post("/api/v1/auth/register", json={"email": email, "full_name": name, "password": "secret123"})
    assert r.status_code == 201, r.text
    user = r.json()
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "secret123"})
    assert r.status_code == 200, r.text
    return {"user": user, "email": email, "headers": {"Authorization": f"Bearer {r.json()['access_token']}"}}


@pytest_asyncio.fixture
async def ana(client):
    return await make_user(client, "Ana")


@pytest_asyncio.fixture
async def bob(client):
    return await make_user(client, "Bob")


@pytest_asyncio.fixture
async def board(client, ana):
    r = await client.post("/api/v1/boards", json={"name": "Proyecto"}, headers=ana["headers"])
    assert r.status_code == 201
    return r.json()


async def add_task(client, headers, column_id, title="T", **extra) -> dict:
    r = await client.post(f"/api/v1/columns/{column_id}/tasks", json={"title": title, **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def get_board(client, headers, board_id) -> dict:
    r = await client.get(f"/api/v1/boards/{board_id}", headers=headers)
    assert r.status_code == 200
    return r.json()


def titles(column: dict) -> list[str]:
    return [t["title"] for t in column["tasks"]]


def positions(items: list[dict]) -> list[int]:
    return [i["position"] for i in items]
