import pytest

pytestmark = pytest.mark.e2e


def test_full_kanban_flow(db):
    c = db.c
    # registrar usuario y crear tablero con 3 columnas
    uid = db.user("flow@x.dev", "Flujo")
    bid = db.board(uid, "Proyecto")
    cols = [db.column(bid, i, n) for i, n in enumerate(["Por hacer", "En curso", "Hecho"])]
    # tareas en la primera columna
    tasks = [db.task(cols[0], i, f"T{i}", created_by=uid) for i in range(4)]
    # mover T1 (pos 1) de la columna 0 a la columna 1 (pos 0), compactando el origen, en una transaccion
    with c.transaction():
        c.execute("UPDATE tasks SET column_id=%s, position=0 WHERE id=%s", (cols[1], tasks[1]))
        c.execute("UPDATE tasks SET position = position - 1 WHERE column_id=%s AND position > 1", (cols[0],))
    c.execute("SET CONSTRAINTS ALL IMMEDIATE")
    src = c.execute("SELECT title, position FROM tasks WHERE column_id=%s ORDER BY position", (cols[0],)).fetchall()
    assert src == [("T0", 0), ("T2", 1), ("T3", 2)]
    assert c.execute("SELECT title, position FROM tasks WHERE column_id=%s", (cols[1],)).fetchall() == [("T1", 0)]
    # reordenar dentro de la columna: T3 al principio
    c.execute("UPDATE tasks SET position = CASE WHEN id=%s THEN 0 ELSE position+1 END WHERE column_id=%s",
              (tasks[3], cols[0]))
    c.execute("SET CONSTRAINTS ALL IMMEDIATE")
    order = [r[0] for r in c.execute("SELECT title FROM tasks WHERE column_id=%s ORDER BY position", (cols[0],))]
    assert order == ["T3", "T0", "T2"]
    # etiquetar y comentar
    lb = db.label(bid, "Urgente", "#ff0000")
    c.execute("INSERT INTO task_labels VALUES (%s,%s)", (tasks[1], lb))
    db.comment(tasks[1], uid, "Primer comentario")
    assert db.one("SELECT count(*) FROM task_labels") == 1
    assert db.one("SELECT count(*) FROM task_comments WHERE task_id=%s", (tasks[1],)) == 1
    # borrar el tablero: cascada completa, el usuario sobrevive
    c.execute("DELETE FROM boards WHERE id=%s", (bid,))
    for tbl in ("board_columns", "tasks", "labels", "task_labels", "task_comments"):
        assert db.one(f"SELECT count(*) FROM {tbl}") == 0, tbl
    assert db.one("SELECT count(*) FROM users WHERE id=%s", (uid,)) == 1


def test_delete_user_cascade_and_set_null(db):
    c = db.c
    owner = db.user("owner@x.dev")
    other = db.user("other@x.dev")
    own_board = db.board(owner)
    other_board = db.board(other)
    own_task = db.task(db.column(own_board), assignee=other, created_by=owner)
    foreign_task = db.task(db.column(other_board), assignee=owner, created_by=owner)
    cm_own = db.comment(foreign_task, owner)
    cm_other = db.comment(own_task, other)
    # Se confirma el setup: Postgres omite la comprobacion de FK en filas creadas en la misma
    # transaccion, lo que haria fallar el SET NULL sobre tareas que a la vez se borran en cascada.
    c.commit()
    try:
        _check_user_delete(db, c, owner, other, own_board, other_board, own_task, foreign_task, cm_own, cm_other)
    finally:
        c.rollback()
        c.execute("DELETE FROM boards WHERE owner_id IN (%s,%s)", (owner, other))
        c.execute("DELETE FROM users WHERE id IN (%s,%s)", (owner, other))
        c.commit()


def _check_user_delete(db, c, owner, other, own_board, other_board, own_task, foreign_task, cm_own, cm_other):
    c.execute("DELETE FROM users WHERE id=%s", (owner,))

    # tableros del dueño y todo lo que cuelga: CASCADE
    assert db.one("SELECT count(*) FROM boards WHERE id=%s", (own_board,)) == 0
    assert db.one("SELECT count(*) FROM tasks WHERE id=%s", (own_task,)) == 0
    assert db.one("SELECT count(*) FROM task_comments WHERE id=%s", (cm_other,)) == 0
    # referencias en tareas ajenas: SET NULL
    row = c.execute("SELECT assignee_id, created_by FROM tasks WHERE id=%s", (foreign_task,)).fetchone()
    assert row == (None, None)
    assert db.one("SELECT author_id FROM task_comments WHERE id=%s", (cm_own,)) is None
    # el otro usuario y su tablero siguen
    assert db.one("SELECT count(*) FROM boards WHERE id=%s", (other_board,)) == 1


def test_delete_column_cascades_tasks(db):
    col = db.column()
    t = db.task(col)
    db.comment(t)
    db.c.execute("DELETE FROM board_columns WHERE id=%s", (col,))
    assert db.one("SELECT count(*) FROM tasks") == 0
    assert db.one("SELECT count(*) FROM task_comments") == 0
