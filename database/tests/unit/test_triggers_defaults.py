import datetime as dt

import pytest

pytestmark = pytest.mark.unit

UPDATES = [
    ("users", "full_name", "'Nuevo'"),
    ("boards", "name", "'Nuevo'"),
    ("board_columns", "name", "'Nuevo'"),
    ("tasks", "title", "'Nuevo'"),
    ("task_comments", "body", "'Nuevo'"),
]


def make(db, table):
    u = db.user()
    b = db.board(u)
    c = db.column(b)
    t = db.task(c)
    return {"users": u, "boards": b, "board_columns": c, "tasks": t, "task_comments": db.comment(t, u)}[table]


@pytest.mark.parametrize("table,col,val", UPDATES)
def test_updated_at_trigger(db, table, col, val):
    rid = make(db, table)
    # now() es constante dentro de la transaccion: forzamos un valor viejo y comprobamos que el trigger lo refresca
    db.c.execute(f"ALTER TABLE {table} DISABLE TRIGGER USER")
    db.c.execute(f"UPDATE {table} SET updated_at = '2000-01-01' WHERE id=%s", (rid,))
    db.c.execute(f"ALTER TABLE {table} ENABLE TRIGGER USER")
    db.c.execute(f"UPDATE {table} SET {col} = {val} WHERE id=%s", (rid,))
    after = db.one(f"SELECT updated_at FROM {table} WHERE id=%s", (rid,))
    assert after > dt.datetime(2001, 1, 1, tzinfo=dt.timezone.utc)


def test_created_at_not_changed_by_update(db):
    rid = make(db, "tasks")
    c0 = db.one("SELECT created_at FROM tasks WHERE id=%s", (rid,))
    db.c.execute("UPDATE tasks SET title='z' WHERE id=%s", (rid,))
    assert db.one("SELECT created_at FROM tasks WHERE id=%s", (rid,)) == c0


def test_labels_has_no_updated_at(db):
    n = db.one("SELECT count(*) FROM information_schema.columns WHERE table_name='labels' AND column_name='updated_at'")
    assert n == 0


def test_user_defaults(db):
    uid = db.user()
    row = db.c.execute("SELECT id, created_at, updated_at FROM users WHERE id=%s", (uid,)).fetchone()
    assert row[0] is not None and row[1] is not None and row[2] is not None


def test_board_defaults(db):
    row = db.c.execute("SELECT color, description, archived_at FROM boards WHERE id=%s", (db.board(),)).fetchone()
    assert row == ("#0f6e63", None, None)


def test_column_defaults(db):
    row = db.c.execute("SELECT wip_limit FROM board_columns WHERE id=%s", (db.column(),)).fetchone()
    assert row == (None,)


def test_task_defaults(db):
    row = db.c.execute(
        "SELECT priority, description, due_date, assignee_id, created_by FROM tasks WHERE id=%s", (db.task(),)
    ).fetchone()
    assert row == ("medium", None, None, None, None)


def test_uuid_defaults_are_distinct(db):
    assert db.user() != db.user()


def test_timestamps_are_timestamptz(db):
    n = db.one("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' "
               "AND column_name IN ('created_at','updated_at') AND data_type <> 'timestamp with time zone'")
    assert n == 0


def test_fk_set_null_on_user_delete(db):
    u = db.user()
    t = db.task(created_by=u, assignee=u)
    cm = db.comment(t, u)
    db.c.execute("DELETE FROM users WHERE id=%s", (u,))
    assert db.c.execute("SELECT assignee_id, created_by FROM tasks WHERE id=%s", (t,)).fetchone() == (None, None)
    assert db.one("SELECT author_id FROM task_comments WHERE id=%s", (cm,)) is None


def test_fk_cascades(db):
    u = db.user()
    b = db.board(u)
    c = db.column(b)
    t = db.task(c)
    lb = db.label(b)
    db.c.execute("INSERT INTO task_labels VALUES (%s,%s)", (t, lb))
    db.comment(t, u)
    db.c.execute("DELETE FROM boards WHERE id=%s", (b,))
    for tbl in ("board_columns", "tasks", "labels", "task_labels", "task_comments"):
        assert db.one(f"SELECT count(*) FROM {tbl}") == 0
