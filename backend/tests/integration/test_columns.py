import uuid

from tests.integration.conftest import add_task, get_board, positions, titles

A = "/api/v1"


async def test_create_column_appends(client, ana, board):
    r = await client.post(f"{A}/boards/{board['id']}/columns", json={"name": "QA", "wip_limit": 3}, headers=ana["headers"])
    assert r.status_code == 201
    c = r.json()
    assert (c["name"], c["position"], c["wip_limit"], c["tasks"], c["board_id"]) == ("QA", 3, 3, [], board["id"])
    r = await client.post(f"{A}/boards/{board['id']}/columns", json={"name": "Z"}, headers=ana["headers"])
    assert r.json()["position"] == 4 and r.json()["wip_limit"] is None


async def test_create_column_422(client, ana, board):
    for bad in ({"name": ""}, {"name": "x" * 61}, {"name": "ok", "wip_limit": 0}, {}):
        r = await client.post(f"{A}/boards/{board['id']}/columns", json=bad, headers=ana["headers"])
        assert r.status_code == 422


async def test_reorder_columns(client, ana, board):
    ids = [c["id"] for c in board["columns"]]
    h = ana["headers"]
    t = await add_task(client, h, ids[0], "keep")
    r = await client.put(f"{A}/boards/{board['id']}/columns/order", json={"column_ids": [ids[2], ids[0], ids[1]]}, headers=h)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()] == [ids[2], ids[0], ids[1]]
    assert positions(r.json()) == [0, 1, 2]
    assert titles(r.json()[1]) == ["keep"]
    b = await get_board(client, h, board["id"])
    assert [c["id"] for c in b["columns"]] == [ids[2], ids[0], ids[1]]
    assert t["id"] == b["columns"][1]["tasks"][0]["id"]


async def test_reorder_columns_422(client, ana, board):
    ids = [c["id"] for c in board["columns"]]
    h = ana["headers"]
    url = f"{A}/boards/{board['id']}/columns/order"
    for bad in ([ids[0], ids[1]], [*ids, str(uuid.uuid4())], [ids[0], ids[0], ids[1]], [ids[0], ids[1], str(uuid.uuid4())], []):
        assert (await client.put(url, json={"column_ids": bad}, headers=h)).status_code == 422
    assert (await client.put(url, json={"column_ids": ["nope"]}, headers=h)).status_code == 422
    assert positions((await get_board(client, h, board["id"]))["columns"]) == [0, 1, 2]


async def test_patch_column_and_remove_wip(client, ana, board):
    cid = board["columns"][0]["id"]
    h = ana["headers"]
    r = await client.patch(f"{A}/columns/{cid}", json={"name": "Backlog", "wip_limit": 5}, headers=h)
    assert r.status_code == 200 and (r.json()["name"], r.json()["wip_limit"]) == ("Backlog", 5)
    r = await client.patch(f"{A}/columns/{cid}", json={"wip_limit": None}, headers=h)
    assert r.json()["wip_limit"] is None and r.json()["name"] == "Backlog"
    for bad in ({"name": None}, {"name": ""}, {"wip_limit": -1}):
        assert (await client.patch(f"{A}/columns/{cid}", json=bad, headers=h)).status_code == 422


async def test_delete_column_cascades_and_compacts(client, ana, board, db):
    from sqlalchemy import text

    h = ana["headers"]
    ids = [c["id"] for c in board["columns"]]
    t = await add_task(client, h, ids[1], "gone")
    await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "c"}, headers=h)
    r = await client.delete(f"{A}/columns/{ids[1]}", headers=h)
    assert r.status_code == 204
    b = await get_board(client, h, board["id"])
    assert [c["id"] for c in b["columns"]] == [ids[0], ids[2]]
    assert positions(b["columns"]) == [0, 1]
    assert (await db.scalar(text("SELECT count(*) FROM tasks"))) == 0
    assert (await db.scalar(text("SELECT count(*) FROM task_comments"))) == 0
    assert (await client.get(f"{A}/tasks/{t['id']}", headers=h)).status_code == 404


async def test_delete_first_column_compacts(client, ana, board):
    ids = [c["id"] for c in board["columns"]]
    await client.delete(f"{A}/columns/{ids[0]}", headers=ana["headers"])
    b = await get_board(client, ana["headers"], board["id"])
    assert [c["id"] for c in b["columns"]] == [ids[1], ids[2]] and positions(b["columns"]) == [0, 1]


async def test_column_foreign_404(client, bob, board):
    cid = board["columns"][0]["id"]
    bh = bob["headers"]
    for method, path, body in [
        ("PATCH", f"/columns/{cid}", {"name": "x"}),
        ("DELETE", f"/columns/{cid}", None),
        ("POST", f"/columns/{cid}/tasks", {"title": "x"}),
        ("PATCH", f"/columns/{uuid.uuid4()}", {"name": "x"}),
    ]:
        assert (await client.request(method, A + path, json=body, headers=bh)).status_code == 404
