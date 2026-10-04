"""Repositorios en memoria para probar servicios sin BD."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

NOW = datetime(2030, 1, 1, tzinfo=timezone.utc)


def _ensure(obj, **defaults):
    for k, v in defaults.items():
        if getattr(obj, k, None) is None:
            setattr(obj, k, v)


class FakeUow:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


class FakeUsers:
    def __init__(self, fail_on_add=None):
        self.items = {}
        self.fail_on_add = fail_on_add

    async def get_by_email(self, email):
        return next((u for u in self.items.values() if u.email.lower() == email.lower()), None)

    async def get_by_id(self, user_id):
        return self.items.get(user_id)

    async def add(self, user):
        if self.fail_on_add:
            raise self.fail_on_add
        _ensure(user, id=uuid.uuid4(), created_at=NOW)
        self.items[user.id] = user
        return user


class FakeStore:
    """Tablero/columnas/tareas/etiquetas en memoria con dueño por tablero."""

    def __init__(self):
        self.boards, self.columns, self.tasks, self.labels, self.comments = {}, {}, {}, {}, {}

    def board_of_column(self, col):
        return self.boards.get(col.board_id)


class FakeBoards:
    def __init__(self, store):
        self.s = store

    async def get(self, board_id, owner_id):
        b = self.s.boards.get(board_id)
        return b if b and b.owner_id == owner_id else None

    async def get_detail(self, board_id, owner_id):
        b = await self.get(board_id, owner_id)
        if b is None:
            return None
        cols = sorted((c for c in self.s.columns.values() if c.board_id == b.id), key=lambda c: c.position)
        for c in cols:
            c.tasks = sorted((t for t in self.s.tasks.values() if t.column_id == c.id), key=lambda t: t.position)
        b.columns = cols
        b.labels = [l for l in self.s.labels.values() if l.board_id == b.id]
        return b

    async def lock(self, board_id):
        self.locked = getattr(self, 'locked', []) + [board_id]

    async def list_summaries(self, owner_id):
        return [(b, 3, 0) for b in self.s.boards.values() if b.owner_id == owner_id]

    async def add(self, board):
        _ensure(board, id=uuid.uuid4(), created_at=NOW, updated_at=NOW, color="#0f6e63")
        self.s.boards[board.id] = board
        return board

    async def delete(self, board):
        self.s.boards.pop(board.id, None)


class FakeColumns:
    def __init__(self, store):
        self.s = store

    async def get(self, column_id, owner_id):
        c = self.s.columns.get(column_id)
        b = self.s.board_of_column(c) if c else None
        return c if b and b.owner_id == owner_id else None

    async def get_with_tasks(self, column_id, owner_id):
        c = await self.get(column_id, owner_id)
        if c:
            c.tasks = sorted((t for t in self.s.tasks.values() if t.column_id == c.id), key=lambda t: t.position)
        return c

    async def list_for_board(self, board_id):
        return sorted((c for c in self.s.columns.values() if c.board_id == board_id), key=lambda c: c.position)

    async def add(self, column):
        _ensure(column, id=uuid.uuid4())
        self.s.columns[column.id] = column
        return column

    async def delete(self, column):
        self.s.columns.pop(column.id, None)
        for t in [t for t in self.s.tasks.values() if t.column_id == column.id]:
            del self.s.tasks[t.id]


class FakeTasks:
    def __init__(self, store):
        self.s = store

    async def get(self, task_id, owner_id):
        t = self.s.tasks.get(task_id)
        if not t:
            return None
        col = self.s.columns[t.column_id]
        return t if self.s.boards[col.board_id].owner_id == owner_id else None

    async def list_for_column(self, column_id):
        return sorted((t for t in self.s.tasks.values() if t.column_id == column_id), key=lambda t: t.position)

    async def add(self, task):
        _ensure(task, id=uuid.uuid4(), created_at=NOW, updated_at=NOW, comment_count=0)
        if getattr(task, "labels", None) is None:
            task.labels = []
        self.s.tasks[task.id] = task
        return task

    async def delete(self, task):
        self.s.tasks.pop(task.id, None)


class FakeLabels:
    def __init__(self, store):
        self.s = store

    async def get(self, label_id, owner_id):
        l = self.s.labels.get(label_id)
        return l if l and self.s.boards[l.board_id].owner_id == owner_id else None

    async def list_for_board(self, board_id):
        return sorted((l for l in self.s.labels.values() if l.board_id == board_id), key=lambda l: l.name)

    async def get_by_name(self, board_id, name):
        return next((l for l in self.s.labels.values() if l.board_id == board_id and l.name == name), None)

    async def get_many(self, board_id, ids):
        return [l for l in self.s.labels.values() if l.board_id == board_id and l.id in set(ids)]

    async def add(self, label):
        _ensure(label, id=uuid.uuid4(), created_at=NOW)
        self.s.labels[label.id] = label
        return label

    async def delete(self, label):
        self.s.labels.pop(label.id, None)


class FakeComments:
    def __init__(self, store, users=None):
        self.s = store
        self.users = users if users is not None else {}

    async def list_for_task(self, task_id):
        return [c for c in self.s.comments.values() if c.task_id == task_id]

    async def get(self, comment_id):
        c = self.s.comments[comment_id]
        u = self.users.get(c.author_id)
        c.author = SimpleNamespace(id=u.id, full_name=u.full_name) if u else None
        return c

    async def add(self, comment):
        _ensure(comment, id=uuid.uuid4(), created_at=NOW)
        self.s.comments[comment.id] = comment
        return comment
