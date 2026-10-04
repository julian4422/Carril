import uuid

import pytest

from tests.integration.conftest import add_task, get_board, positions, titles

A = "/api/v1"


async def cols(client, ana, board):
    return (await get_board(client, ana["headers"], board["id"]))["columns"]


async def test_create_task_defaults_and_order(client, ana, board):
    h = ana["headers"]
    c0 = board["columns"][0]["id"]
    t1 = await add_task(client, h, c0, "uno")
    t2 = await add_task(client, h, c0, "dos", description="d", priority="urgent", due_date="2031-02-03", assignee_id=ana["user"]["id"])
    assert (t1["position"], t1["priority"], t1["description"], t1["due_date"], t1["assignee_id"]) == (0, "medium", None, None, None)
    assert (t1["labels"], t1["comment_count"], t1["column_id"]) == ([], 0, c0)
    assert (t2["position"], t2["priority"], t2["due_date"], t2["assignee_id"]) == (1, "urgent", "2031-02-03", ana["user"]["id"])


@pytest.mark.parametrize(
    "bad",
    [{"title": ""}, {"title": "x" * 201}, {}, {"title": "a", "priority": "nope"}, {"title": "a", "due_date": "mañana"}],
)
async def test_create_task_422(client, ana, board, bad):
    r = await client.post(f"{A}/columns/{board['columns'][0]['id']}/tasks", json=bad, headers=ana["headers"])
    assert r.status_code == 422


async def test_assignee_must_be_owner(client, ana, bob, board):
    c0 = board["columns"][0]["id"]
    r = await client.post(f"{A}/columns/{c0}/tasks", json={"title": "a", "assignee_id": bob["user"]["id"]}, headers=ana["headers"])
    assert r.status_code == 422
    t = await add_task(client, ana["headers"], c0)
    r = await client.patch(f"{A}/tasks/{t['id']}", json={"assignee_id": str(uuid.uuid4())}, headers=ana["headers"])
    assert r.status_code == 422


async def test_get_and_patch_task(client, ana, board):
    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"], "orig", description="d", due_date="2030-05-05")
    assert (await client.get(f"{A}/tasks/{t['id']}", headers=h)).json()["title"] == "orig"
    r = await client.patch(f"{A}/tasks/{t['id']}", json={"title": "nuevo", "priority": "low", "assignee_id": ana["user"]["id"]}, headers=h)
    assert r.status_code == 200
    j = r.json()
    assert (j["title"], j["priority"], j["assignee_id"], j["description"], j["due_date"]) == ("nuevo", "low", ana["user"]["id"], "d", "2030-05-05")
    r = await client.patch(f"{A}/tasks/{t['id']}", json={"description": None, "due_date": None, "assignee_id": None}, headers=h)
    j = r.json()
    assert (j["description"], j["due_date"], j["assignee_id"], j["title"]) == (None, None, None, "nuevo")
    for bad in ({"title": None}, {"priority": None}, {"title": ""}, {"priority": "x"}):
        assert (await client.patch(f"{A}/tasks/{t['id']}", json=bad, headers=h)).status_code == 422


async def test_delete_task_compacts(client, ana, board):
    h = ana["headers"]
    c0 = board["columns"][0]["id"]
    ts = [await add_task(client, h, c0, n) for n in "abcd"]
    r = await client.delete(f"{A}/tasks/{ts[1]['id']}", headers=h)
    assert r.status_code == 204
    col = (await cols(client, ana, board))[0]
    assert titles(col) == ["a", "c", "d"] and positions(col["tasks"]) == [0, 1, 2]
    assert (await client.get(f"{A}/tasks/{ts[1]['id']}", headers=h)).status_code == 404


async def _setup(client, ana, board, names="abcd"):
    c = board["columns"]
    return [await add_task(client, ana["headers"], c[0]["id"], n) for n in names]


async def _move(client, ana, task, column_id, position):
    r = await client.post(f"{A}/tasks/{task['id']}/move", json={"column_id": column_id, "position": position}, headers=ana["headers"])
    assert r.status_code == 200, r.text
    return r.json()


async def test_move_same_column_down_and_up(client, ana, board):
    ts = await _setup(client, ana, board)
    c0 = board["columns"][0]["id"]
    out = await _move(client, ana, ts[0], c0, 2)
    assert out["position"] == 2
    col = (await cols(client, ana, board))[0]
    assert titles(col) == ["b", "c", "a", "d"] and positions(col["tasks"]) == [0, 1, 2, 3]
    await _move(client, ana, ts[3], c0, 0)
    col = (await cols(client, ana, board))[0]
    assert titles(col) == ["d", "b", "c", "a"] and positions(col["tasks"]) == [0, 1, 2, 3]


async def test_move_clamps_position(client, ana, board):
    ts = await _setup(client, ana, board, "abc")
    c0 = board["columns"][0]["id"]
    assert (await _move(client, ana, ts[0], c0, 99))["position"] == 2
    assert (await _move(client, ana, ts[0], c0, -5))["position"] == 0
    assert titles((await cols(client, ana, board))[0]) == ["a", "b", "c"]


async def test_move_between_columns(client, ana, board):
    ts = await _setup(client, ana, board, "abc")
    c = board["columns"]
    other = [await add_task(client, ana["headers"], c[1]["id"], n) for n in "xy"]
    out = await _move(client, ana, ts[1], c[1]["id"], 1)
    assert out["column_id"] == c[1]["id"] and out["position"] == 1
    got = await cols(client, ana, board)
    assert titles(got[0]) == ["a", "c"] and positions(got[0]["tasks"]) == [0, 1]
    assert titles(got[1]) == ["x", "b", "y"] and positions(got[1]["tasks"]) == [0, 1, 2]
    await _move(client, ana, other[0], c[2]["id"], 50)  # a columna vacía, acotado
    got = await cols(client, ana, board)
    assert titles(got[2]) == ["x"] and titles(got[1]) == ["b", "y"] and positions(got[1]["tasks"]) == [0, 1]


async def test_move_422_other_board_and_404_foreign(client, ana, bob, board):
    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"])
    other_board = (await client.post(f"{A}/boards", json={"name": "Otro"}, headers=h)).json()
    r = await client.post(f"{A}/tasks/{t['id']}/move", json={"column_id": other_board["columns"][0]["id"], "position": 0}, headers=h)
    assert r.status_code == 422
    bob_board = (await client.post(f"{A}/boards", json={"name": "B"}, headers=bob["headers"])).json()
    r = await client.post(f"{A}/tasks/{t['id']}/move", json={"column_id": bob_board["columns"][0]["id"], "position": 0}, headers=h)
    assert r.status_code == 404
    r = await client.post(f"{A}/tasks/{t['id']}/move", json={"column_id": str(uuid.uuid4()), "position": 0}, headers=h)
    assert r.status_code == 404
    r = await client.post(f"{A}/tasks/{t['id']}/move", json={"column_id": board["columns"][1]["id"], "position": 0}, headers=bob["headers"])
    assert r.status_code == 404
    r = await client.post(f"{A}/tasks/{t['id']}/move", json={"position": 0}, headers=h)
    assert r.status_code == 422


async def test_set_labels(client, ana, bob, board):
    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"])
    l1 = (await client.post(f"{A}/boards/{board['id']}/labels", json={"name": "B", "color": "#111111"}, headers=h)).json()
    l2 = (await client.post(f"{A}/boards/{board['id']}/labels", json={"name": "A", "color": "#222222"}, headers=h)).json()
    r = await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": [l1["id"], l2["id"], l1["id"]]}, headers=h)
    assert r.status_code == 200
    assert [x["name"] for x in r.json()["labels"]] == ["A", "B"]
    r = await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": [l1["id"]]}, headers=h)
    assert [x["id"] for x in r.json()["labels"]] == [l1["id"]]
    r = await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": []}, headers=h)
    assert r.json()["labels"] == []
    other = (await client.post(f"{A}/boards", json={"name": "O"}, headers=h)).json()
    foreign = (await client.post(f"{A}/boards/{other['id']}/labels", json={"name": "F", "color": "#333333"}, headers=h)).json()
    for ids in ([foreign["id"]], [str(uuid.uuid4())]):
        assert (await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": ids}, headers=h)).status_code == 422
    assert (await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": []}, headers=bob["headers"])).status_code == 404


async def test_task_foreign_404(client, ana, bob, board):
    t = await add_task(client, ana["headers"], board["columns"][0]["id"])
    bh = bob["headers"]
    for method, path, body in [
        ("GET", f"/tasks/{t['id']}", None),
        ("PATCH", f"/tasks/{t['id']}", {"title": "x"}),
        ("DELETE", f"/tasks/{t['id']}", None),
        ("GET", f"/tasks/{t['id']}/comments", None),
        ("POST", f"/tasks/{t['id']}/comments", {"body": "x"}),
        ("GET", f"/tasks/{uuid.uuid4()}", None),
    ]:
        assert (await client.request(method, A + path, json=body, headers=bh)).status_code == 404
    assert (await client.get(f"{A}/tasks/{t['id']}", headers=ana["headers"])).status_code == 200


async def test_comments(client, ana, board):
    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"])
    assert (await client.get(f"{A}/tasks/{t['id']}/comments", headers=h)).json() == []
    c1 = await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "primero"}, headers=h)
    c2 = await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "segundo"}, headers=h)
    assert c1.status_code == 201
    j = c1.json()
    assert j["author"] == {"id": ana["user"]["id"], "full_name": "Ana"} and j["task_id"] == t["id"]
    lst = (await client.get(f"{A}/tasks/{t['id']}/comments", headers=h)).json()
    assert [c["body"] for c in lst] == ["primero", "segundo"] and lst[1]["id"] == c2.json()["id"]
    assert (await client.get(f"{A}/tasks/{t['id']}", headers=h)).json()["comment_count"] == 2
    for bad in ({"body": ""}, {"body": "x" * 2001}, {}):
        assert (await client.post(f"{A}/tasks/{t['id']}/comments", json=bad, headers=h)).status_code == 422


async def test_comment_author_null_after_user_removed(client, ana, board, db):
    from sqlalchemy import text

    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"])
    await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "x"}, headers=h)
    await db.execute(text("UPDATE task_comments SET author_id = NULL"))
    await db.commit()
    assert (await client.get(f"{A}/tasks/{t['id']}/comments", headers=h)).json()[0]["author"] is None


async def test_labels_crud(client, ana, bob, board):
    h = ana["headers"]
    url = f"{A}/boards/{board['id']}/labels"
    r = await client.post(url, json={"name": "Urgente", "color": "#AbCdEf"}, headers=h)
    assert r.status_code == 201 and r.json()["board_id"] == board["id"]
    lid = r.json()["id"]
    assert (await client.post(url, json={"name": "Urgente", "color": "#000000"}, headers=h)).status_code == 409
    # otro tablero puede repetir el nombre
    other = (await client.post(f"{A}/boards", json={"name": "O"}, headers=h)).json()
    assert (await client.post(f"{A}/boards/{other['id']}/labels", json={"name": "Urgente", "color": "#000000"}, headers=h)).status_code == 201
    for bad in ({"name": "", "color": "#000000"}, {"name": "x", "color": "blue"}, {"name": "x" * 41, "color": "#000000"}, {"name": "x"}):
        assert (await client.post(url, json=bad, headers=h)).status_code == 422
    assert [x["name"] for x in (await client.get(url, headers=h)).json()] == ["Urgente"]
    assert (await client.delete(f"{A}/labels/{lid}", headers=bob["headers"])).status_code == 404
    t = await add_task(client, h, board["columns"][0]["id"])
    await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": [lid]}, headers=h)
    assert (await client.delete(f"{A}/labels/{lid}", headers=h)).status_code == 204
    assert (await client.get(f"{A}/tasks/{t['id']}", headers=h)).json()["labels"] == []
    assert (await client.delete(f"{A}/labels/{lid}", headers=h)).status_code == 404


async def test_user_isolation_in_listing(client, ana, bob, board):
    assert (await client.get(f"{A}/boards", headers=bob["headers"])).json() == []
