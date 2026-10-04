import uuid

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterIn
from app.schemas.boards import BoardCreate, BoardUpdate, ColumnCreate, ColumnUpdate
from app.schemas.labels import LabelCreate
from app.schemas.tasks import CommentCreate, TaskCreate, TaskUpdate


def test_register_rules():
    ok = RegisterIn(email=" a@b.co ", full_name=" Ana ", password="12345678")
    assert ok.email == "a@b.co" and ok.full_name == "Ana"
    for bad in (
        dict(email="a@b.co", full_name="A", password="1234567"),
        dict(email="sin-arroba", full_name="A", password="12345678"),
        dict(email="a@b.co", full_name="   ", password="12345678"),
        dict(email="a@b.co", full_name="x" * 121, password="12345678"),
    ):
        with pytest.raises(ValidationError):
            RegisterIn(**bad)


def test_board_color_and_name():
    assert BoardCreate(name="x").color == "#0f6e63"
    for bad in ("#12345", "123456", "#gggggg"):
        with pytest.raises(ValidationError):
            BoardCreate(name="x", color=bad)
    with pytest.raises(ValidationError):
        BoardCreate(name="")


def test_partial_updates_distinguish_null_from_missing():
    assert BoardUpdate(description=None).model_fields_set == {"description"}
    assert BoardUpdate().model_fields_set == set()
    with pytest.raises(ValidationError):
        BoardUpdate(name=None)
    assert ColumnUpdate(wip_limit=None).model_fields_set == {"wip_limit"}
    with pytest.raises(ValidationError):
        ColumnUpdate(name=None)
    with pytest.raises(ValidationError):
        TaskUpdate(title=None)
    with pytest.raises(ValidationError):
        TaskUpdate(priority=None)
    assert TaskUpdate(due_date=None, assignee_id=None).model_fields_set == {"due_date", "assignee_id"}


def test_column_limits():
    with pytest.raises(ValidationError):
        ColumnCreate(name="a", wip_limit=0)
    with pytest.raises(ValidationError):
        ColumnCreate(name="a" * 61)
    assert ColumnCreate(name="a", wip_limit=2).wip_limit == 2


def test_task_and_comment_and_label():
    t = TaskCreate(title="t", assignee_id=str(uuid.uuid4()), due_date="2030-01-02")
    assert t.priority.value == "medium" and str(t.due_date) == "2030-01-02"
    with pytest.raises(ValidationError):
        TaskCreate(title="t", priority="critical")
    with pytest.raises(ValidationError):
        CommentCreate(body="")
    with pytest.raises(ValidationError):
        CommentCreate(body="x" * 2001)
    with pytest.raises(ValidationError):
        LabelCreate(name="a", color="rojo")
