import uuid

import psycopg
import pytest
from psycopg import errors

pytestmark = pytest.mark.unit


def fails(conn, exc, query, params=None):
    with pytest.raises(exc):
        with conn.transaction():
            conn.execute(query, params)


def test_email_unique(db):
    db.user("a@x.dev")
    fails(db.c, errors.UniqueViolation,
          "INSERT INTO users (email, full_name, password_hash) VALUES ('a@x.dev','B','h')")


def test_email_unique_case_insensitive(db):
    db.user("Ana@X.dev")
    fails(db.c, errors.UniqueViolation,
          "INSERT INTO users (email, full_name, password_hash) VALUES ('ANA@x.DEV','B','h')")


def test_email_lookup_case_insensitive(db):
    uid = db.user("Mixto@X.dev")
    assert db.one("SELECT id FROM users WHERE email = 'mixto@x.dev'") == uid


@pytest.mark.parametrize("name", ["", "x" * 121])
def test_user_full_name_length(db, name):
    fails(db.c, errors.CheckViolation,
          "INSERT INTO users (email, full_name, password_hash) VALUES ('l@x.dev',%s,'h')", (name,))


def test_user_full_name_limits_ok(db):
    db.user(name="x")
    db.user(name="x" * 120)


def test_board_fk_owner(db):
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO boards (owner_id, name) VALUES (%s,'t')", (uuid.uuid4(),))


def test_column_fk_board(db):
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO board_columns (board_id, name, position) VALUES (%s,'c',0)", (uuid.uuid4(),))


def test_task_fk_column(db):
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO tasks (column_id, title, position) VALUES (%s,'t',0)", (uuid.uuid4(),))


def test_task_fk_assignee(db):
    col = db.column()
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO tasks (column_id, title, position, assignee_id) VALUES (%s,'t',0,%s)", (col, uuid.uuid4()))


def test_task_fk_created_by(db):
    col = db.column()
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO tasks (column_id, title, position, created_by) VALUES (%s,'t',0,%s)", (col, uuid.uuid4()))


def test_label_fk_board(db):
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO labels (board_id, name, color) VALUES (%s,'l','#000000')", (uuid.uuid4(),))


def test_task_labels_fks(db):
    t = db.task()
    lb = db.label(db.board())
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO task_labels (task_id, label_id) VALUES (%s,%s)", (uuid.uuid4(), lb))
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO task_labels (task_id, label_id) VALUES (%s,%s)", (t, uuid.uuid4()))


def test_task_labels_pk_unique(db):
    b = db.board()
    t = db.task(db.column(b))
    lb = db.label(b)
    db.c.execute("INSERT INTO task_labels VALUES (%s,%s)", (t, lb))
    fails(db.c, errors.UniqueViolation, "INSERT INTO task_labels VALUES (%s,%s)", (t, lb))


def test_comment_fks(db):
    t = db.task()
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO task_comments (task_id, body) VALUES (%s,'x')", (uuid.uuid4(),))
    fails(db.c, errors.ForeignKeyViolation,
          "INSERT INTO task_comments (task_id, author_id, body) VALUES (%s,%s,'x')", (t, uuid.uuid4()))


def test_invalid_priority_enum(db):
    col = db.column()
    fails(db.c, errors.InvalidTextRepresentation,
          "INSERT INTO tasks (column_id, title, position, priority) VALUES (%s,'t',0,'critical')", (col,))


@pytest.mark.parametrize("p", ["low", "medium", "high", "urgent"])
def test_valid_priorities(db, p):
    col = db.column()
    db.c.execute("INSERT INTO tasks (column_id, title, position, priority) VALUES (%s,'t',0,%s)", (col, p))


@pytest.mark.parametrize("color", ["red", "#12345", "#1234567", "#gggggg", "0f6e63", ""])
def test_board_color_check(db, color):
    o = db.user()
    fails(db.c, errors.CheckViolation, "INSERT INTO boards (owner_id, name, color) VALUES (%s,'b',%s)", (o, color))


@pytest.mark.parametrize("color", ["red", "#12345", "#zzzzzz"])
def test_label_color_check(db, color):
    b = db.board()
    fails(db.c, errors.CheckViolation, "INSERT INTO labels (board_id, name, color) VALUES (%s,'l',%s)", (b, color))


def test_color_uppercase_hex_ok(db):
    db.label(db.board(), color="#ABCDEF")


LENGTH_CASES = {
    "boards": ("INSERT INTO boards (owner_id, name) VALUES (%(owner)s,%(v)s)", 120),
    "board_columns": ("INSERT INTO board_columns (board_id, name, position) VALUES (%(board)s,%(v)s,%(pos)s)", 60),
    "tasks": ("INSERT INTO tasks (column_id, title, position) VALUES (%(col)s,%(v)s,%(pos)s)", 200),
    "labels": ("INSERT INTO labels (board_id, name, color) VALUES (%(board)s,%(v)s,'#000000')", 40),
    "task_comments": ("INSERT INTO task_comments (task_id, body) VALUES (%(task)s,%(v)s)", 2000),
}


@pytest.mark.parametrize("table", list(LENGTH_CASES))
def test_length_checks(db, table):
    query, mx = LENGTH_CASES[table]
    b = db.board()
    col = db.column(b, 0)
    ctx = {"owner": db.user(), "board": b, "col": col, "task": db.task(col, 0)}
    for i, bad in enumerate(("", "x" * (mx + 1))):
        fails(db.c, errors.CheckViolation, query, {**ctx, "v": bad, "pos": 10 + i})
    # limites validos: 1 y max caracteres (valores distintos por si hay UNIQUE)
    for i, ok in enumerate(("x", "y" * mx)):
        db.c.execute(query, {**ctx, "v": ok, "pos": 20 + i})


@pytest.mark.parametrize("table", ["board_columns", "tasks"])
def test_negative_position(db, table):
    if table == "board_columns":
        b = db.board()
        fails(db.c, errors.CheckViolation,
              "INSERT INTO board_columns (board_id, name, position) VALUES (%s,'c',-1)", (b,))
    else:
        c = db.column()
        fails(db.c, errors.CheckViolation,
              "INSERT INTO tasks (column_id, title, position) VALUES (%s,'t',-1)", (c,))


@pytest.mark.parametrize("v", [0, -5])
def test_wip_limit_positive(db, v):
    b = db.board()
    fails(db.c, errors.CheckViolation,
          "INSERT INTO board_columns (board_id, name, position, wip_limit) VALUES (%s,'c',0,%s)", (b, v))


def test_wip_limit_null_and_positive_ok(db):
    b = db.board()
    db.c.execute("INSERT INTO board_columns (board_id, name, position, wip_limit) VALUES (%s,'c',0,NULL)", (b,))
    db.c.execute("INSERT INTO board_columns (board_id, name, position, wip_limit) VALUES (%s,'d',1,3)", (b,))


def test_column_position_unique(db):
    b = db.board()
    db.column(b, 0)
    db.c.execute("SET CONSTRAINTS ALL IMMEDIATE")
    fails(db.c, errors.UniqueViolation,
          "INSERT INTO board_columns (board_id, name, position) VALUES (%s,'dup',0)", (b,))


def test_column_position_same_in_other_board_ok(db):
    db.column(db.board(), 0)
    db.column(db.board(), 0)


def test_task_position_unique(db):
    c = db.column()
    db.task(c, 0)
    db.c.execute("SET CONSTRAINTS ALL IMMEDIATE")
    fails(db.c, errors.UniqueViolation,
          "INSERT INTO tasks (column_id, title, position) VALUES (%s,'dup',0)", (c,))


def test_task_position_unique_enforced_at_commit(schema_db):
    """Estando diferida, la violacion se detecta al COMMIT."""
    from tests.conftest import dsn
    with psycopg.connect(dsn(schema_db)) as c:
        uid = c.execute("INSERT INTO users (email, full_name, password_hash) VALUES (%s,'a','h') RETURNING id",
                        (f"{uuid.uuid4().hex}@x.dev",)).fetchone()[0]
        bid = c.execute("INSERT INTO boards (owner_id, name) VALUES (%s,'b') RETURNING id", (uid,)).fetchone()[0]
        col = c.execute("INSERT INTO board_columns (board_id, name, position) VALUES (%s,'c',0) RETURNING id",
                        (bid,)).fetchone()[0]
        c.execute("INSERT INTO tasks (column_id, title, position) VALUES (%s,'a',0)", (col,))
        c.execute("INSERT INTO tasks (column_id, title, position) VALUES (%s,'b',0)", (col,))
        with pytest.raises(errors.UniqueViolation):
            c.commit()
        c.rollback()
        c.execute("DELETE FROM users WHERE id=%s", (uid,))
        c.commit()


def test_label_name_unique_per_board(db):
    b = db.board()
    db.label(b, "Bug")
    fails(db.c, errors.UniqueViolation, "INSERT INTO labels (board_id, name, color) VALUES (%s,'Bug','#000000')", (b,))
    db.label(db.board(), "Bug")  # otro tablero: ok


def test_deferrable_swap_columns(db):
    b = db.board()
    a = db.column(b, 0, "A")
    c = db.column(b, 1, "B")
    db.c.execute("UPDATE board_columns SET position = 1 - position WHERE board_id = %s", (b,))
    rows = dict(db.c.execute("SELECT id, position FROM board_columns WHERE board_id=%s", (b,)).fetchall())
    assert rows == {a: 1, c: 0}


def test_deferrable_swap_tasks(db):
    col = db.column()
    t1 = db.task(col, 0, "uno")
    t2 = db.task(col, 1, "dos")
    db.c.execute("UPDATE tasks SET position = 1 - position WHERE column_id = %s", (col,))
    db.c.execute("SET CONSTRAINTS ALL IMMEDIATE")  # verifica que el estado final es valido
    rows = dict(db.c.execute("SELECT id, position FROM tasks WHERE column_id=%s", (col,)).fetchall())
    assert rows == {t1: 1, t2: 0}


def test_unique_constraints_are_deferrable(db):
    rows = db.c.execute(
        "SELECT conname, condeferrable, condeferred FROM pg_constraint "
        "WHERE conname IN ('board_columns_board_position_key','tasks_column_position_key')").fetchall()
    assert len(rows) == 2 and all(r[1] and r[2] for r in rows)
