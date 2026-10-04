import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.models import Priority
from app.schemas.common import trimmed
from app.schemas.labels import LabelOut


class TaskCreate(BaseModel):
    title: trimmed(200)
    description: str | None = None
    priority: Priority = Priority.medium
    due_date: date | None = None
    assignee_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    title: trimmed(200) | None = None
    description: str | None = None
    priority: Priority | None = None
    due_date: date | None = None
    assignee_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _non_nullable(self):
        for field in ("title", "priority"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} no puede ser null")
        return self


class TaskMove(BaseModel):
    column_id: uuid.UUID
    position: int


class TaskLabelsIn(BaseModel):
    label_ids: list[uuid.UUID]


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    column_id: uuid.UUID
    title: str
    description: str | None
    priority: Priority
    due_date: date | None
    position: int
    assignee_id: uuid.UUID | None
    labels: list[LabelOut]
    comment_count: int
    created_at: datetime
    updated_at: datetime


class CommentCreate(BaseModel):
    body: trimmed(2000)


class CommentAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_id: uuid.UUID
    author: CommentAuthor | None
    body: str
    created_at: datetime
