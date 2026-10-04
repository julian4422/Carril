import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.common import Color, trimmed


class LabelCreate(BaseModel):
    name: trimmed(40)
    color: Color


class LabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    color: str
