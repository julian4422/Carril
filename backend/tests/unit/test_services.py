import uuid
from types import SimpleNamespace as NS

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError, UnauthorizedError, ValidationError
from app.schemas.auth import LoginIn, RegisterIn
from app.schemas.boards import BoardCreate, BoardUpdate, ColumnCreate, ColumnOrderIn, ColumnUpdate
from app.schemas.labels import LabelCreate
from app.schemas.tasks import CommentCreate, TaskCreate, TaskLabelsIn, TaskMove, TaskUpdate
from app.services.auth_service import AuthService
from app.services.board_service import BoardService
from app.services.column_service import ColumnService
from app.services.comment_service import CommentService
from app.services.label_service import LabelService
from app.services.task_service import TaskService
from tests.unit.fakes import (
    FakeBoards,
    FakeColumns,
    FakeComments,
    FakeLabels,
    FakeStore,
    FakeTasks,
    FakeUow,
    FakeUsers,
)

SETTINGS = Settings(jwt_secret="unit-test-secret-unit-test-secret-0123", bcrypt_rounds=4, jwt_expires_minutes=10)
pytestmark = pytest.mark.asyncio


class World:
    def __init__(self):
        self.store = FakeStore()
        self.uow = FakeUow()
        self.users = FakeUsers()
        self.boards = FakeBoards(self.store)
        self.columns = FakeColumns(self.store)
        self.tasks = FakeTasks(self.store)
        self.labels = FakeLabels(self.store)
        self.comments = FakeComments(self.store, self.users.items)
        self.auth = AuthService(self.users, self.uow, SETTINGS)
        self.board_svc = BoardService(self.boards, self.columns, self.uow)
        self.col_svc = ColumnService(self.boards, self.columns, self.uow)
        self.task_svc = TaskService(self.tasks, self.columns, self.labels, self.boards, self.uow)
        self.label_svc = LabelService(self.boards, self.labels, self.uow)
        self.comment_svc = CommentService(self.tasks, self.comments, self.uow)
        self.owner = uuid.uuid4()
        self.stranger = uuid.uuid4()
        self.users.items[self.owner] = NS(id=self.owner, full_name="Dueña", email="owner@b.co")

    async def board(self):
        b = await self.board_svc.create(self.owner, BoardCreate(name="B"))
        return b, [c.id for c in b.columns]

    async def task(self, column_id, title="t"):
        return await self.task_svc.create(self.owner, column_id, TaskCreate(title=title))

    async def order(self, column_id):
        return [t.title for t in await self.tasks.list_for_column(column_id)]


@pytest.fixture
def w():
    return World()


# ---- auth ----
async def test_register_hashes_password_and_login(w):
    out = await w.auth.register(RegisterIn(email="a@b.co", full_name="A", password="12345678"))
    stored = w.users.items[out.id]
    assert stored.password_hash != "12345678" and w.uow.commits == 1
    tok = await w.auth.login(LoginIn(email="a@b.co", password="12345678"))
    assert tok.expires_in == 600 and tok.token_type == "bearer"
    user = await w.auth.authenticate(tok.access_token)
    assert user.id == out.id


async def test_register_duplicate_and_race(w):
    await w.auth.register(RegisterIn(email="a@b.co", full_name="A", password="12345678"))
    with pytest.raises(ConflictError):
        await w.auth.register(RegisterIn(email="A@B.co", full_name="A", password="12345678"))
    w2 = World()
    w2.users.fail_on_add = IntegrityError("x", {}, Exception())
    with pytest.raises(ConflictError):
        await w2.auth.register(RegisterIn(email="n@b.co", full_name="A", password="12345678"))
    assert w2.uow.rollbacks == 1


async def test_login_failures_and_bad_tokens(w):
    await w.auth.register(RegisterIn(email="a@b.co", full_name="A", password="12345678"))
    with pytest.raises(UnauthorizedError):
        await w.auth.login(LoginIn(email="a@b.co", password="mala-clave"))
    with pytest.raises(UnauthorizedError):
        await w.auth.login(LoginIn(email="x@b.co", password="12345678"))
    with pytest.raises(UnauthorizedError):
        await w.auth.authenticate("basura")
    from app.core.security import create_access_token

    for sub in ("no-uuid", str(uuid.uuid4())):
        with pytest.raises(UnauthorizedError):
            await w.auth.authenticate(create_access_token(sub, SETTINGS.jwt_secret, 5))


# ---- boards / default columns ----
async def test_create_board_makes_default_columns(w):
    b, ids = await w.board()
    assert [c.name for c in b.columns] == ["Por hacer", "En curso", "Hecho"]
    assert [c.position for c in b.columns] == [0, 1, 2] and w.uow.commits == 1


async def test_board_ownership_404(w):
    b, _ = await w.board()
    for call in (
        w.board_svc.get(w.stranger, b.id),
        w.board_svc.update(w.stranger, b.id, BoardUpdate(name="x")),
        w.board_svc.delete(w.stranger, b.id),
        w.col_svc.create(w.stranger, b.id, ColumnCreate(name="c")),
        w.col_svc.reorder(w.stranger, b.id, ColumnOrderIn(column_ids=[])),
        w.label_svc.list(w.stranger, b.id),
        w.label_svc.create(w.stranger, b.id, LabelCreate(name="l", color="#000000")),
    ):
        with pytest.raises(NotFoundError):
            await call


async def test_board_update_list_delete(w):
    b, _ = await w.board()
    upd = await w.board_svc.update(w.owner, b.id, BoardUpdate(name="Nuevo", description=None))
    assert upd.name == "Nuevo"
    assert [s.name for s in await w.board_svc.list(w.owner)] == ["Nuevo"]
    assert await w.board_svc.list(w.stranger) == []
    await w.board_svc.delete(w.owner, b.id)
    with pytest.raises(NotFoundError):
        await w.board_svc.get(w.owner, b.id)


# ---- columns ----
async def test_column_create_reorder_delete(w):
    b, ids = await w.board()
    c = await w.col_svc.create(w.owner, b.id, ColumnCreate(name="QA"))
    assert c.position == 3
    new_order = [c.id, ids[2], ids[0], ids[1]]
    out = await w.col_svc.reorder(w.owner, b.id, ColumnOrderIn(column_ids=new_order))
    assert [x.id for x in out] == new_order and [x.position for x in out] == [0, 1, 2, 3]
    await w.col_svc.delete(w.owner, ids[2])
    assert [x.position for x in await w.columns.list_for_board(b.id)] == [0, 1, 2]
    upd = await w.col_svc.update(w.owner, ids[0], ColumnUpdate(name="N", wip_limit=2))
    assert (upd.name, upd.wip_limit) == ("N", 2)
    assert (await w.col_svc.update(w.owner, ids[0], ColumnUpdate(wip_limit=None))).wip_limit is None


async def test_column_reorder_rejects_mismatched_sets(w):
    b, ids = await w.board()
    for bad in ([ids[0]], [*ids, uuid.uuid4()], [ids[0], ids[0], ids[1]]):
        with pytest.raises(ValidationError):
            await w.col_svc.reorder(w.owner, b.id, ColumnOrderIn(column_ids=bad))


async def test_column_foreign_404(w):
    _, ids = await w.board()
    with pytest.raises(NotFoundError):
        await w.col_svc.update(w.stranger, ids[0], ColumnUpdate(name="x"))
    with pytest.raises(NotFoundError):
        await w.col_svc.delete(w.stranger, ids[0])
    with pytest.raises(NotFoundError):
        await w.task_svc.create(w.stranger, ids[0], TaskCreate(title="x"))


# ---- tasks: reordenamiento ----
async def _abcd(w):
    b, ids = await w.board()
    tasks = [await w.task(ids[0], n) for n in "abcd"]
    return ids, tasks


async def test_move_same_column_down(w):
    ids, t = await _abcd(w)
    out = await w.task_svc.move(w.owner, t[0].id, TaskMove(column_id=ids[0], position=2))
    assert out.position == 2 and await w.order(ids[0]) == ["b", "c", "a", "d"]


async def test_move_same_column_up(w):
    ids, t = await _abcd(w)
    await w.task_svc.move(w.owner, t[3].id, TaskMove(column_id=ids[0], position=1))
    assert await w.order(ids[0]) == ["a", "d", "b", "c"]
    assert [x.position for x in await w.tasks.list_for_column(ids[0])] == [0, 1, 2, 3]


@pytest.mark.parametrize("pos,expected", [(500, ["b", "c", "d", "a"]), (-9, ["a", "b", "c", "d"])])
async def test_move_clamps(w, pos, expected):
    ids, t = await _abcd(w)
    await w.task_svc.move(w.owner, t[0].id, TaskMove(column_id=ids[0], position=pos))
    assert await w.order(ids[0]) == expected


async def test_move_between_columns(w):
    ids, t = await _abcd(w)
    x = await w.task(ids[1], "x")
    out = await w.task_svc.move(w.owner, t[1].id, TaskMove(column_id=ids[1], position=0))
    assert out.column_id == ids[1] and out.position == 0
    assert await w.order(ids[0]) == ["a", "c", "d"] and await w.order(ids[1]) == ["b", "x"]
    assert [q.position for q in await w.tasks.list_for_column(ids[0])] == [0, 1, 2]
    assert x.id in w.store.tasks


async def test_move_to_other_board_is_422_and_foreign_404(w):
    ids, t = await _abcd(w)
    _, other_ids = await w.board()
    with pytest.raises(ValidationError):
        await w.task_svc.move(w.owner, t[0].id, TaskMove(column_id=other_ids[0], position=0))
    with pytest.raises(NotFoundError):
        await w.task_svc.move(w.stranger, t[0].id, TaskMove(column_id=ids[1], position=0))
    with pytest.raises(NotFoundError):
        await w.task_svc.move(w.owner, t[0].id, TaskMove(column_id=uuid.uuid4(), position=0))


async def test_delete_task_compacts(w):
    ids, t = await _abcd(w)
    await w.task_svc.delete(w.owner, t[0].id)
    assert [x.position for x in await w.tasks.list_for_column(ids[0])] == [0, 1, 2]
    assert await w.order(ids[0]) == ["b", "c", "d"]


async def test_task_create_update_assignee_rules(w):
    _, ids = await w.board()
    created = await w.task(ids[0])
    assert created.position == 0 and created.priority.value == "medium"
    with pytest.raises(ValidationError):
        await w.task_svc.create(w.owner, ids[0], TaskCreate(title="x", assignee_id=w.stranger))
    ok = await w.task_svc.create(w.owner, ids[0], TaskCreate(title="y", assignee_id=w.owner))
    assert ok.assignee_id == w.owner
    with pytest.raises(ValidationError):
        await w.task_svc.update(w.owner, created.id, TaskUpdate(assignee_id=w.stranger))
    upd = await w.task_svc.update(w.owner, created.id, TaskUpdate(title="z", assignee_id=None))
    assert upd.title == "z"
    assert (await w.task_svc.get(w.owner, created.id)).title == "z"


async def test_task_foreign_404(w):
    _, ids = await w.board()
    t = await w.task(ids[0])
    for call in (
        w.task_svc.get(w.stranger, t.id),
        w.task_svc.update(w.stranger, t.id, TaskUpdate(title="x")),
        w.task_svc.delete(w.stranger, t.id),
        w.task_svc.set_labels(w.stranger, t.id, TaskLabelsIn(label_ids=[])),
        w.comment_svc.list(w.stranger, t.id),
        w.comment_svc.create(w.stranger, t.id, CommentCreate(body="x")),
    ):
        with pytest.raises(NotFoundError):
            await call


async def test_labels_and_comments(w):
    b, ids = await w.board()
    t = await w.task(ids[0])
    lab = await w.label_svc.create(w.owner, b.id, LabelCreate(name="Bug", color="#ff0000"))
    with pytest.raises(ConflictError):
        await w.label_svc.create(w.owner, b.id, LabelCreate(name="Bug", color="#00ff00"))
    out = await w.task_svc.set_labels(w.owner, t.id, TaskLabelsIn(label_ids=[lab.id, lab.id]))
    assert [l.id for l in out.labels] == [lab.id]
    with pytest.raises(ValidationError):
        await w.task_svc.set_labels(w.owner, t.id, TaskLabelsIn(label_ids=[uuid.uuid4()]))
    assert [l.name for l in await w.label_svc.list(w.owner, b.id)] == ["Bug"]
    with pytest.raises(NotFoundError):
        await w.label_svc.delete(w.stranger, lab.id)
    await w.label_svc.delete(w.owner, lab.id)
    with pytest.raises(NotFoundError):
        await w.label_svc.delete(w.owner, lab.id)

    c = await w.comment_svc.create(w.owner, t.id, CommentCreate(body="hola"))
    assert c.author.full_name == "Dueña" and c.body == "hola"
    assert [x.body for x in await w.comment_svc.list(w.owner, t.id)] == ["hola"]
