"""Fixtures compartidas: BD temporal por sesion con el DDL aplicado."""
import os
import uuid
from pathlib import Path

import psycopg
import pytest
from dotenv import load_dotenv
from psycopg import sql

DB_DIR = Path(__file__).resolve().parents[1]
ROOT = DB_DIR.parent
load_dotenv(ROOT / ".env")

DDL_FILES = sorted((DB_DIR / "ddl").glob("*.sql"))
SEED_FILES = sorted((DB_DIR / "seed").glob("*.sql"))


def _env(name, default):
    return os.environ.get(name, default)


def dsn(dbname):
    return (
        f"host=localhost port={_env('POSTGRES_PORT', '5432')} "
        f"user={_env('POSTGRES_USER', 'carril')} "
        f"password={_env('POSTGRES_PASSWORD', 'carril')} dbname={dbname}"
    )


def apply_files(dbname, files):
    with psycopg.connect(dsn(dbname), autocommit=True) as c:
        for f in files:
            c.execute(f.read_text())


@pytest.fixture(scope="session")
def main_db():
    return _env("POSTGRES_DB", "carril")


@pytest.fixture(scope="session")
def test_db_name():
    return _env("POSTGRES_TEST_DB", "carril_test")


def _create_temp_db():
    name = f"carril_dbtest_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(dsn("postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    return name


def _drop_temp_db(name):
    with psycopg.connect(dsn("postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


@pytest.fixture(scope="session")
def temp_db():
    """BD temporal carril_dbtest_<random> por sesion; se borra al final."""
    name = _create_temp_db()
    try:
        yield name
    finally:
        _drop_temp_db(name)


@pytest.fixture
def scratch_db():
    """BD temporal vacia propia de una prueba (para DDL/seed destructivos)."""
    name = _create_temp_db()
    try:
        yield name
    finally:
        _drop_temp_db(name)


@pytest.fixture(scope="session")
def schema_db(temp_db):
    """BD temporal con el DDL aplicado."""
    apply_files(temp_db, DDL_FILES)
    return temp_db


@pytest.fixture
def conn(schema_db):
    """Conexion con transaccion que se revierte al terminar cada prueba."""
    c = psycopg.connect(dsn(schema_db))
    try:
        yield c
    finally:
        c.rollback()
        c.close()


@pytest.fixture
def db(conn):
    return Helpers(conn)


class Helpers:
    def __init__(self, conn):
        self.c = conn

    def one(self, query, params=None):
        return self.c.execute(query, params).fetchone()[0]

    def user(self, email=None, name="Ana"):
        email = email or f"u{uuid.uuid4().hex[:8]}@x.dev"
        return self.one(
            "INSERT INTO users (email, full_name, password_hash) VALUES (%s,%s,'h') RETURNING id",
            (email, name),
        )

    def board(self, owner=None, name="Tablero"):
        owner = owner or self.user()
        return self.one("INSERT INTO boards (owner_id, name) VALUES (%s,%s) RETURNING id", (owner, name))

    def column(self, board=None, position=0, name="Col"):
        board = board or self.board()
        return self.one(
            "INSERT INTO board_columns (board_id, name, position) VALUES (%s,%s,%s) RETURNING id",
            (board, name, position),
        )

    def task(self, column=None, position=0, title="Tarea", **kw):
        column = column or self.column()
        return self.one(
            "INSERT INTO tasks (column_id, title, position, assignee_id, created_by) VALUES (%s,%s,%s,%s,%s) RETURNING id",
            (column, title, position, kw.get("assignee"), kw.get("created_by")),
        )

    def label(self, board, name="L", color="#aabbcc"):
        return self.one(
            "INSERT INTO labels (board_id, name, color) VALUES (%s,%s,%s) RETURNING id", (board, name, color)
        )

    def comment(self, task, author=None, body="hola"):
        return self.one(
            "INSERT INTO task_comments (task_id, author_id, body) VALUES (%s,%s,%s) RETURNING id",
            (task, author, body),
        )
