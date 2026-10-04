import uuid

from tests.integration.conftest import add_task, get_board, positions, titles

A = "/api/v1"


async def test_create_board_default_columns(client, ana):
    r = await client.post(f"{A}/boards", json={"name": "  Mi tablero ", "description": "d", "color": "#112233"}, headers=ana["headers"])
    assert r.status_code == 201
    b = r.json()
    assert b["name"] == "Mi tablero" and b["description"] == "d" and b["color"] == "#112233"
    assert [c["name"] for c in b["columns"]] == ["Por hacer", "En curso", "Hecho"]
    assert positions(b["columns"]) == [0, 1, 2]
    assert all(c["tasks"] == [] and c["board_id"] == b["id"] for c in b["columns"])
    assert b["labels"] == []


async def test_create_board_default_color_and_422(client, ana):
    r = await client.post(f"{A}/boards", json={"name": "X"}, headers=ana["headers"])
    assert r.json()["color"] == "#0f6e63"
    for bad in ({"name": ""}, {"name": "x", "color": "red"}, {"name": "x" * 121}, {}):
        assert (await client.post(f"{A}/boards", json=bad, headers=ana["headers"])).status_code == 422


async def test_list_boards_counts_order_and_isolation(client, ana, bob):
    h = ana["headers"]
    first = (await client.post(f"{A}/boards", json={"name": "Primero"}, headers=h)).json()
    second = (await client.post(f"{A}/boards", json={"name": "Segundo"}, headers=h)).json()
    await client.post(f"{A}/boards", json={"name": "De Bob"}, headers=bob["headers"])
    await add_task(client, h, first["columns"][0]["id"], "a")
    await add_task(client, h, first["columns"][1]["id"], "b")
    r = await client.get(f"{A}/boards", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert [b["name"] for b in data] == ["Segundo", "Primero"]
    by = {b["id"]: b for b in data}
    assert by[first["id"]]["task_count"] == 2 and by[first["id"]]["column_count"] == 3
    assert by[second["id"]]["task_count"] == 0
    assert set(data[0]) == {"id", "name", "description", "color", "created_at", "updated_at", "column_count", "task_count"}


async def test_list_boards_hides_archived(client, ana, db):
    from sqlalchemy import text

    b = (await client.post(f"{A}/boards", json={"name": "Old"}, headers=ana["headers"])).json()
    await db.execute(text("UPDATE boards SET archived_at = now() WHERE id = :i"), {"i": b["id"]})
    await db.commit()
    assert (await client.get(f"{A}/boards", headers=ana["headers"])).json() == []


async def test_get_board_detail_full(client, ana, board):
    h = ana["headers"]
    cols = board["columns"]
    lbl = (await client.post(f"{A}/boards/{board['id']}/labels", json={"name": "Bug", "color": "#ff0000"}, headers=h)).json()
    t = await add_task(client, h, cols[0]["id"], "uno", priority="high", due_date="2030-01-31", description="x")
    await client.put(f"{A}/tasks/{t['id']}/labels", json={"label_ids": [lbl["id"]]}, headers=h)
    await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "hola"}, headers=h)
    b = await get_board(client, h, board["id"])
    task = b["columns"][0]["tasks"][0]
    assert task["priority"] == "high" and task["due_date"] == "2030-01-31" and task["comment_count"] == 1
    assert task["labels"] == [lbl]
    assert b["labels"] == [lbl]


async def test_get_board_query_count_is_constant(client, ana, board, engine):
    from sqlalchemy import event

    h = ana["headers"]
    for col in board["columns"]:
        for i in range(5):
            await add_task(client, h, col["id"], f"t{i}")
    stmts = []

    def _count(conn, cursor, statement, *a):
        stmts.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", _count)
    try:
        r = await client.get(f"{A}/boards/{board['id']}", headers=h)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _count)
    assert r.status_code == 200
    # usuario + tablero + columnas + tareas + etiquetas de tareas + etiquetas del tablero (sin N+1)
    assert len(stmts) <= 8, stmts


async def test_patch_board(client, ana, board):
    r = await client.patch(f"{A}/boards/{board['id']}", json={"name": "Nuevo", "description": "desc", "color": "#abcdef"}, headers=ana["headers"])
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["description"], r.json()["color"]) == ("Nuevo", "desc", "#abcdef")
    r = await client.patch(f"{A}/boards/{board['id']}", json={"description": None}, headers=ana["headers"])
    assert r.json()["description"] is None and r.json()["name"] == "Nuevo"
    for bad in ({"name": None}, {"color": "zzz"}, {"name": ""}):
        assert (await client.patch(f"{A}/boards/{board['id']}", json=bad, headers=ana["headers"])).status_code == 422


async def test_delete_board_cascades(client, ana, board, db):
    from sqlalchemy import text

    h = ana["headers"]
    t = await add_task(client, h, board["columns"][0]["id"])
    await client.post(f"{A}/tasks/{t['id']}/comments", json={"body": "c"}, headers=h)
    await client.post(f"{A}/boards/{board['id']}/labels", json={"name": "L", "color": "#000000"}, headers=h)
    r = await client.delete(f"{A}/boards/{board['id']}", headers=h)
    assert r.status_code == 204 and r.content == b""
    for table in ("boards", "board_columns", "tasks", "labels", "task_comments"):
        assert (await db.scalar(text(f"SELECT count(*) FROM {table}"))) == 0
    assert (await client.get(f"{A}/boards/{board['id']}", headers=h)).status_code == 404


async def test_board_foreign_and_unknown_404(client, ana, bob, board):
    bh = bob["headers"]
    unknown = uuid.uuid4()
    for method, path, body in [
        ("GET", f"/boards/{board['id']}", None),
        ("PATCH", f"/boards/{board['id']}", {"name": "hack"}),
        ("DELETE", f"/boards/{board['id']}", None),
        ("POST", f"/boards/{board['id']}/columns", {"name": "c"}),
        ("PUT", f"/boards/{board['id']}/columns/order", {"column_ids": []}),
        ("GET", f"/boards/{board['id']}/labels", None),
        ("POST", f"/boards/{board['id']}/labels", {"name": "l", "color": "#000000"}),
        ("GET", f"/boards/{unknown}", None),
    ]:
        r = await client.request(method, A + path, json=body, headers=bh)
        assert r.status_code == 404, (method, path, r.status_code)
        assert r.json() == {"detail": r.json()["detail"]}
    # el dueño sigue viéndolo intacto
    assert (await get_board(client, ana["headers"], board["id"]))["name"] == "Proyecto"


async def test_invalid_uuid_422_and_requires_auth(client, board):
    assert (await client.get(f"{A}/boards/not-a-uuid", headers={"Authorization": "Bearer x"})).status_code == 401
    for method, path in [("GET", "/boards"), ("POST", "/boards"), ("GET", f"/boards/{board['id']}"), ("DELETE", f"/tasks/{board['id']}")]:
        assert (await client.request(method, A + path)).status_code == 401


async def test_invalid_uuid_path_422(client, ana):
    assert (await client.get(f"{A}/boards/not-a-uuid", headers=ana["headers"])).status_code == 422
