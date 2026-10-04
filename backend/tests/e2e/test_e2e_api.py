"""Flujos completos contra la API real en Docker (httpx síncrono)."""
import httpx


def test_health(http):
    r = http.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "ok"}


def test_docs_available(http):
    base = str(http.base_url).rsplit("/api/v1", 1)[0]
    assert httpx.get(f"{base}/docs", timeout=10).status_code == 200


def test_auth_required(http):
    assert http.get("/boards").status_code == 401


def test_register_duplicate_and_login(http, user1):
    r = http.post("/auth/register", json={"email": user1["email"], "full_name": "X", "password": "e2e-password"})
    assert r.status_code == 409
    assert http.post("/auth/login", json={"email": user1["email"], "password": "bad-password"}).status_code == 401
    me = http.get("/auth/me", headers=user1["h"])
    assert me.status_code == 200 and me.json()["email"] == user1["email"]


def test_full_board_flow(http, user1):
    h = user1["h"]
    board = http.post("/boards", json={"name": "E2E", "description": "flujo"}, headers=h).json()
    cols = board["columns"]
    assert [c["name"] for c in cols] == ["Por hacer", "En curso", "Hecho"]
    todo, doing, done = (c["id"] for c in cols)

    tasks = [http.post(f"/columns/{todo}/tasks", json={"title": t}, headers=h).json() for t in ("a", "b", "c")]
    assert [t["position"] for t in tasks] == [0, 1, 2]

    # mover entre columnas
    r = http.post(f"/tasks/{tasks[1]['id']}/move", json={"column_id": doing, "position": 0}, headers=h)
    assert r.status_code == 200 and r.json()["column_id"] == doing
    # reordenar dentro de la misma columna
    http.post(f"/tasks/{tasks[0]['id']}/move", json={"column_id": todo, "position": 9}, headers=h)
    b = http.get(f"/boards/{board['id']}", headers=h).json()
    assert [t["title"] for t in b["columns"][0]["tasks"]] == ["c", "a"]
    assert [t["position"] for t in b["columns"][0]["tasks"]] == [0, 1]
    assert [t["title"] for t in b["columns"][1]["tasks"]] == ["b"]

    # reordenar columnas
    r = http.put(f"/boards/{board['id']}/columns/order", json={"column_ids": [done, todo, doing]}, headers=h)
    assert r.status_code == 200 and [c["id"] for c in r.json()] == [done, todo, doing]
    assert http.put(f"/boards/{board['id']}/columns/order", json={"column_ids": [done]}, headers=h).status_code == 422

    # etiquetas
    label = http.post(f"/boards/{board['id']}/labels", json={"name": "Bug", "color": "#ff0000"}, headers=h).json()
    assert http.post(f"/boards/{board['id']}/labels", json={"name": "Bug", "color": "#ff0000"}, headers=h).status_code == 409
    r = http.put(f"/tasks/{tasks[1]['id']}/labels", json={"label_ids": [label["id"]]}, headers=h)
    assert r.json()["labels"][0]["name"] == "Bug"

    # comentarios
    r = http.post(f"/tasks/{tasks[1]['id']}/comments", json={"body": "listo"}, headers=h)
    assert r.status_code == 201 and r.json()["author"]["full_name"] == "E2E"
    assert len(http.get(f"/tasks/{tasks[1]['id']}/comments", headers=h).json()) == 1

    # editar
    r = http.patch(f"/tasks/{tasks[1]['id']}", json={"title": "b2", "priority": "urgent", "due_date": "2031-01-01"}, headers=h)
    j = r.json()
    assert (j["title"], j["priority"], j["due_date"], j["comment_count"]) == ("b2", "urgent", "2031-01-01", 1)
    assert http.patch(f"/columns/{todo}", json={"name": "Backlog", "wip_limit": 4}, headers=h).json()["wip_limit"] == 4
    assert http.patch(f"/boards/{board['id']}", json={"name": "E2E v2"}, headers=h).json()["name"] == "E2E v2"

    summary = http.get("/boards", headers=h).json()
    assert summary[0]["task_count"] == 3 and summary[0]["column_count"] == 3

    # borrar tarea, etiqueta, columna y tablero
    assert http.delete(f"/tasks/{tasks[2]['id']}", headers=h).status_code == 204
    b = http.get(f"/boards/{board['id']}", headers=h).json()
    backlog = next(c for c in b["columns"] if c["id"] == todo)
    assert [t["position"] for t in backlog["tasks"]] == [0]
    assert http.delete(f"/labels/{label['id']}", headers=h).status_code == 204
    assert http.delete(f"/columns/{done}", headers=h).status_code == 204
    b = http.get(f"/boards/{board['id']}", headers=h).json()
    assert [c["position"] for c in b["columns"]] == [0, 1]
    assert http.delete(f"/boards/{board['id']}", headers=h).status_code == 204
    assert http.get(f"/boards/{board['id']}", headers=h).status_code == 404


def test_users_are_isolated(http, user1, user2):
    board = http.post("/boards", json={"name": "Privado"}, headers=user1["h"]).json()
    col = board["columns"][0]["id"]
    task = http.post(f"/columns/{col}/tasks", json={"title": "secreta"}, headers=user1["h"]).json()
    h2 = user2["h"]
    assert http.get("/boards", headers=h2).json() == []
    for method, path, body in [
        ("GET", f"/boards/{board['id']}", None),
        ("DELETE", f"/boards/{board['id']}", None),
        ("PATCH", f"/columns/{col}", {"name": "x"}),
        ("GET", f"/tasks/{task['id']}", None),
        ("POST", f"/tasks/{task['id']}/comments", {"body": "x"}),
        ("POST", f"/tasks/{task['id']}/move", {"column_id": col, "position": 0}),
    ]:
        assert http.request(method, path, json=body, headers=h2).status_code == 404, (method, path)
    assert http.get(f"/tasks/{task['id']}", headers=user1["h"]).json()["title"] == "secreta"
