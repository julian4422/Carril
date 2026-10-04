import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_session
from tests.integration.conftest import add_task, get_board, positions

A = "/api/v1"


async def test_concurrent_task_creation_no_500(client, ana, board):
    h, col = ana["headers"], board["columns"][0]["id"]
    rs = await asyncio.gather(*[client.post(f"{A}/columns/{col}/tasks", json={"title": f"t{i}"}, headers=h) for i in range(10)])
    assert [r.status_code for r in rs] == [201] * 10
    tasks = (await get_board(client, h, board["id"]))["columns"][0]["tasks"]
    assert positions(tasks) == list(range(10))


async def test_concurrent_moves_no_500_and_contiguous(client, ana, board):
    h, cols = ana["headers"], board["columns"]
    ts = [await add_task(client, h, cols[0]["id"], f"t{i}") for i in range(8)]
    reqs = []
    for i, t in enumerate(ts):
        target = cols[1]["id"] if i % 2 == 0 else cols[0]["id"]
        reqs.append(client.post(f"{A}/tasks/{t['id']}/move", json={"column_id": target, "position": 0}, headers=h))
    rs = await asyncio.gather(*reqs)
    assert all(r.status_code == 200 for r in rs), [r.text for r in rs]
    b = await get_board(client, h, board["id"])
    assert sorted(len(c["tasks"]) for c in b["columns"][:2]) == [4, 4]
    for c in b["columns"]:
        assert positions(c["tasks"]) == list(range(len(c["tasks"])))


async def test_concurrent_column_creation_and_deletes(client, ana, board):
    h = ana["headers"]
    rs = await asyncio.gather(*[client.post(f"{A}/boards/{board['id']}/columns", json={"name": f"c{i}"}, headers=h) for i in range(8)])
    assert [r.status_code for r in rs] == [201] * 8
    b = await get_board(client, h, board["id"])
    assert positions(b["columns"]) == list(range(11))
    # borrados concurrentes de tareas y de columnas
    col = b["columns"][0]["id"]
    ts = [await add_task(client, h, col, f"t{i}") for i in range(6)]
    rs = await asyncio.gather(*[client.delete(f"{A}/tasks/{t['id']}", headers=h) for t in ts[:4]])
    assert [r.status_code for r in rs] == [204] * 4
    assert positions((await get_board(client, h, board["id"]))["columns"][0]["tasks"]) == [0, 1]
    rs = await asyncio.gather(*[client.delete(f"{A}/columns/{c['id']}", headers=h) for c in b["columns"][3:7]])
    assert all(r.status_code == 204 for r in rs)
    assert positions((await get_board(client, h, board["id"]))["columns"]) == list(range(7))


async def test_concurrent_move_and_delete_same_task_no_500(client, ana, board):
    h, cols = ana["headers"], board["columns"]
    t = await add_task(client, h, cols[0]["id"])
    rs = await asyncio.gather(
        client.post(f"{A}/tasks/{t['id']}/move", json={"column_id": cols[1]["id"], "position": 0}, headers=h),
        client.delete(f"{A}/tasks/{t['id']}", headers=h),
    )
    assert all(r.status_code < 500 for r in rs)


async def test_concurrent_reorder_columns(client, ana, board):
    h = ana["headers"]
    ids = [c["id"] for c in board["columns"]]
    orders = [ids, ids[::-1], [ids[1], ids[0], ids[2]]]
    rs = await asyncio.gather(*[client.put(f"{A}/boards/{board['id']}/columns/order", json={"column_ids": o}, headers=h) for o in orders * 2])
    assert all(r.status_code == 200 for r in rs)
    assert positions((await get_board(client, h, board["id"]))["columns"]) == [0, 1, 2]


async def test_integrity_error_maps_to_409(app, client, ana):
    from sqlalchemy.exc import IntegrityError

    class Boom:
        async def execute(self, *a, **k):
            raise IntegrityError("stmt", {}, Exception("dup"))

        async def scalar(self, *a, **k):
            raise IntegrityError("stmt", {}, Exception("dup"))

    async def _boom():
        yield Boom()

    app.dependency_overrides[get_session] = _boom
    r = await client.get(f"{A}/boards", headers={"Authorization": "Bearer x"})
    assert r.status_code == 401  # el auth falla antes; el handler se prueba con el login
    r = await client.post(f"{A}/auth/login", json={"email": "a@b.co", "password": "12345678"})
    assert r.status_code == 409 and "detail" in r.json()


async def _client_with_failure(app, exc):
    class Broken:
        async def execute(self, *a, **k):
            raise exc

        async def scalar(self, *a, **k):
            raise exc

    async def _broken():
        yield Broken()

    app.dependency_overrides[get_session] = _broken
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test")


@pytest.mark.parametrize("exc,status,detail", [
    (OperationalError("s", {}, Exception("conn")), 503, "Base de datos no disponible"),
    (ConnectionRefusedError("refused"), 503, "Base de datos no disponible"),
    (RuntimeError("boom"), 500, "Error interno"),
])
async def test_unhandled_errors_are_json(app, exc, status, detail):
    c = await _client_with_failure(app, exc)
    async with c:
        r = await c.post(f"{A}/auth/login", json={"email": "a@b.co", "password": "12345678"})
    assert r.status_code == status
    assert r.headers["content-type"].startswith("application/json")
    assert r.json() == {"detail": detail}


async def test_whitespace_only_fields_422(client, ana, board):
    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"])
    assert (await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "   "}, headers=h)).status_code == 422
    assert (await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "  hi  "}, headers=h)).json()["body"] == "hi"
    assert (await client.post(f"{A}/boards", json={"name": "  "}, headers=h)).status_code == 422
    assert (await client.post(f"{A}/columns/{board['columns'][0]['id']}/tasks", json={"title": " \t"}, headers=h)).status_code == 422
    r = await client.post(f"{A}/auth/register", json={"email": "ws@carril-test.dev", "full_name": "   ", "password": "password1"})
    assert r.status_code == 422
