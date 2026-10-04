import uuid

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.db.models import Label
from app.schemas.labels import LabelCreate, LabelOut


class LabelService:
    def __init__(self, boards, labels, uow):
        self.boards = boards
        self.labels = labels
        self.uow = uow

    async def list(self, owner_id: uuid.UUID, board_id: uuid.UUID) -> list[LabelOut]:
        if await self.boards.get(board_id, owner_id) is None:
            raise NotFoundError("Tablero no encontrado")
        return [LabelOut.model_validate(label) for label in await self.labels.list_for_board(board_id)]

    async def create(self, owner_id: uuid.UUID, board_id: uuid.UUID, data: LabelCreate) -> LabelOut:
        if await self.boards.get(board_id, owner_id) is None:
            raise NotFoundError("Tablero no encontrado")
        if await self.labels.get_by_name(board_id, data.name):
            raise ConflictError("Ya existe una etiqueta con ese nombre en el tablero")
        try:
            label = await self.labels.add(Label(board_id=board_id, name=data.name, color=data.color))
            await self.uow.commit()
        except IntegrityError:
            await self.uow.rollback()
            raise ConflictError("Ya existe una etiqueta con ese nombre en el tablero") from None
        return LabelOut.model_validate(label)

    async def delete(self, owner_id: uuid.UUID, label_id: uuid.UUID) -> None:
        label = await self.labels.get(label_id, owner_id)
        if label is None:
            raise NotFoundError("Etiqueta no encontrada")
        await self.labels.delete(label)
        await self.uow.commit()
