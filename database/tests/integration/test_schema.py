import psycopg
import pytest

from tests.conftest import DDL_FILES, SEED_FILES, apply_files, dsn

pytestmark = pytest.mark.integration

# (tabla -> {columna: (tipo information_schema/udt, nullable, tiene_default)})
EXPECTED = {
    "users": {"id": ("uuid", False, True), "email": ("citext", False, False), "full_name": ("text", False, False),
              "password_hash": ("text", False, False), "created_at": ("timestamptz", False, True),
              "updated_at": ("timestamptz", False, True)},
    "boards": {"id": ("uuid", False, True), "owner_id": ("uuid", False, False), "name": ("text", False, False),
               "description": ("text", True, False), "color": ("text", False, True),
               "archived_at": ("timestamptz", True, False), "created_at": ("timestamptz", False, True),
               "updated_at": ("timestamptz", False, True)},
    "board_columns": {"id": ("uuid", False, True), "board_id": ("uuid", False, False), "name": ("text", False, False),
                      "position": ("int4", False, False), "wip_limit": ("int4", True, False),
                      "created_at": ("timestamptz", False, True), "updated_at": ("timestamptz", False, True)},
    "tasks": {"id": ("uuid", False, True), "column_id": ("uuid", False, False), "title": ("text", False, False),
              "description": ("text", True, False), "priority": ("task_priority", False, True),
              "due_date": ("date", True, False), "position": ("int4", False, False),
              "assignee_id": ("uuid", True, False), "created_by": ("uuid", True, False),
              "created_at": ("timestamptz", False, True), "updated_at": ("timestamptz", False, True)},
    "labels": {"id": ("uuid", False, True), "board_id": ("uuid", False, False), "name": ("text", False, False),
               "color": ("text", False, False), "created_at": ("timestamptz", False, True)},
    "task_labels": {"task_id": ("uuid", False, False), "label_id": ("uuid", False, False)},
    "task_comments": {"id": ("uuid", False, True), "task_id": ("uuid", False, False),
                      "author_id": ("uuid", True, False), "body": ("text", False, False),
                      "created_at": ("timestamptz", False, True), "updated_at": ("timestamptz", False, True)},
}

FKS = {  # (tabla, columna): (referenciada, on delete)
    ("boards", "owner_id"): ("users", "c"), ("board_columns", "board_id"): ("boards", "c"),
    ("tasks", "column_id"): ("board_columns", "c"), ("tasks", "assignee_id"): ("users", "n"),
    ("tasks", "created_by"): ("users", "n"), ("labels", "board_id"): ("boards", "c"),
    ("task_labels", "task_id"): ("tasks", "c"), ("task_labels", "label_id"): ("labels", "c"),
    ("task_comments", "task_id"): ("tasks", "c"), ("task_comments", "author_id"): ("users", "n"),
}

TRIGGERED = ["users", "boards", "board_columns", "tasks", "task_comments"]

INDEXES = [
    "idx_boards_owner_id", "idx_boards_owner_created", "idx_board_columns_board_pos", "idx_tasks_column_pos",
    "idx_tasks_assignee_id", "idx_tasks_created_by", "idx_labels_board_id", "idx_task_labels_label_id",
    "idx_task_comments_task_created", "idx_task_comments_author_id",
]


def check_schema(c):
    cols = c.execute(
        "SELECT table_name, column_name, udt_name, is_nullable, column_default FROM information_schema.columns "
        "WHERE table_schema='public'").fetchall()
    actual = {}
    for t, col, udt, nul, dflt in cols:
        udt = {"timestamptz": "timestamptz"}.get(udt, udt)
        actual.setdefault(t, {})[col] = (udt, nul == "YES", dflt is not None)
    assert actual == EXPECTED

    fks = {}
    for t, col, ref, act in c.execute(
        "SELECT cl.relname, a.attname, rf.relname, con.confdeltype FROM pg_constraint con "
        "JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_class rf ON rf.oid=con.confrelid "
        "JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1] "
        "WHERE con.contype='f' AND cl.relnamespace='public'::regnamespace").fetchall():
        fks[(t, col)] = (ref, act)
    assert fks == FKS

    idx = {r[0] for r in c.execute("SELECT indexname FROM pg_indexes WHERE schemaname='public'").fetchall()}
    assert set(INDEXES) <= idx

    trg = {r[0] for r in c.execute(
        "SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "
        "WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg\\_%\\_updated\\_at'").fetchall()}
    assert trg == set(TRIGGERED)

    assert c.execute("SELECT enum_range(NULL::task_priority)::text").fetchone()[0] == "{low,medium,high,urgent}"
    ext = {r[0] for r in c.execute("SELECT extname FROM pg_extension").fetchall()}
    assert {"pgcrypto", "citext"} <= ext
    defs = {r[0]: r[1] for r in c.execute(
        "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='u' "
        "AND conname IN ('board_columns_board_position_key','tasks_column_position_key')").fetchall()}
    assert all("DEFERRABLE INITIALLY DEFERRED" in d for d in defs.values()) and len(defs) == 2
    assert c.execute("SELECT count(*) FROM pg_proc WHERE proname='set_updated_at'").fetchone()[0] == 1


def test_ddl_applies_in_order_and_is_idempotent(scratch_db):
    names = [f.name for f in DDL_FILES]
    assert names == sorted(names) and len(names) == 5
    apply_files(scratch_db, DDL_FILES)
    apply_files(scratch_db, DDL_FILES)  # segunda vez sin error
    with psycopg.connect(dsn(scratch_db)) as c:
        check_schema(c)


def test_seed_twice_and_counts(scratch_db):
    apply_files(scratch_db, DDL_FILES)
    apply_files(scratch_db, SEED_FILES)
    apply_files(scratch_db, SEED_FILES)
    with psycopg.connect(dsn(scratch_db)) as c:
        assert counts(c) == (1, 1, 3, 8, 3, 7, 4)
        assert c.execute("SELECT password_hash FROM users WHERE email='DEMO@carril.dev'").fetchone()[0].startswith("$2b$")


def counts(c):
    return tuple(c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in
                 ("users", "boards", "board_columns", "tasks", "labels", "task_labels", "task_comments"))


def test_seed_password_verifies(scratch_db):
    import bcrypt
    apply_files(scratch_db, DDL_FILES)
    apply_files(scratch_db, SEED_FILES)
    with psycopg.connect(dsn(scratch_db)) as c:
        h = c.execute("SELECT password_hash FROM users WHERE email='demo@carril.dev'").fetchone()[0]
    assert bcrypt.checkpw(b"demo1234", h.encode())


def test_seed_positions_contiguous(scratch_db):
    apply_files(scratch_db, DDL_FILES)
    apply_files(scratch_db, SEED_FILES)
    with psycopg.connect(dsn(scratch_db)) as c:
        bad = c.execute(
            "SELECT column_id FROM tasks GROUP BY column_id HAVING min(position)<>0 OR max(position)<>count(*)-1"
        ).fetchall()
        assert bad == []


def test_real_containers_schema(main_db, test_db_name):
    """Contenedor real: carril y carril_test tienen el esquema; carril tiene el seed."""
    for name in (main_db, test_db_name):
        with psycopg.connect(dsn(name)) as c:
            check_schema(c)
    with psycopg.connect(dsn(main_db)) as c:
        assert c.execute("SELECT count(*) FROM users WHERE email='demo@carril.dev'").fetchone()[0] == 1
        assert c.execute(
            "SELECT count(*) FROM board_columns WHERE board_id='00000000-0000-4000-8000-0000000000b1'"
        ).fetchone()[0] == 3
        assert c.execute("SELECT count(*) FROM tasks").fetchone()[0] >= 8
