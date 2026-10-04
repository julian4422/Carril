import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Color, trimmed
from app.schemas.labels import LabelOut
from app.schemas.tasks import TaskOut


class BoardCreate(BaseModel):
    name: trimmed(120)
    description: str | None = None
    color: Color = "#0f6e63"


class BoardUpdate(BaseModel):
    name: trimmed(120) | None = None
    description: str | None = None
    color: Color | None = None

    @model_validator(mode="after")
    def _non_nullable(self):
        for field in ("name", "color"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} no puede ser null")
        return self


class ColumnCreate(BaseModel):
    name: trimmed(60)
    wip_limit: int | None = Field(default=None, gt=0)


class ColumnUpdate(BaseModel):
    name: trimmed(60) | None = None
    wip_limit: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _non_nullable(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name no puede ser null")
        return self


class ColumnOrderIn(BaseModel):
    column_ids: list[uuid.UUID]


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    position: int
    wip_limit: int | None
    tasks: list[TaskOut]


class BoardSummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    color: str
    created_at: datetime
    updated_at: datetime
    column_count: int
    task_count: int


class BoardDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    color: str
    created_at: datetime
    updated_at: datetime
    columns: list[ColumnOut]
    labels: list[LabelOut]
