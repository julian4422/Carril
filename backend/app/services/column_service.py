import uuid

from app.core.errors import NotFoundError, ValidationError
from app.db.models import BoardColumn
from app.schemas.boards import ColumnCreate, ColumnOrderIn, ColumnOut, ColumnUpdate
from app.services import ordering


class ColumnService:
    def __init__(self, boards, columns, uow):
        self.boards = boards
        self.columns = columns
        self.uow = uow

    async def _out(self, owner_id: uuid.UUID, column_id: uuid.UUID) -> ColumnOut:
        column = await self.columns.get_with_tasks(column_id, owner_id)
        if column is None:
            raise NotFoundError("Columna no encontrada")
        return ColumnOut.model_validate(column)

    async def create(self, owner_id: uuid.UUID, board_id: uuid.UUID, data: ColumnCreate) -> ColumnOut:
        board = await self.boards.get(board_id, owner_id)
        if board is None:
            raise NotFoundError("Tablero no encontrado")
        await self.boards.lock(board_id)
        siblings = await self.columns.list_for_board(board_id)
        column = await self.columns.add(
            BoardColumn(board_id=board_id, name=data.name, wip_limit=data.wip_limit, position=len(siblings))
        )
        await self.uow.commit()
        return await self._out(owner_id, column.id)

    async def reorder(self, owner_id: uuid.UUID, board_id: uuid.UUID, data: ColumnOrderIn) -> list[ColumnOut]:
        board = await self.boards.get(board_id, owner_id)
        if board is None:
            raise NotFoundError("Tablero no encontrado")
        await self.boards.lock(board_id)
        current = await self.columns.list_for_board(board_id)
        if not ordering.same_members([c.id for c in current], data.column_ids):
            raise ValidationError("column_ids debe contener exactamente todas las columnas del tablero")
        by_id = {c.id: c for c in current}
        ordering.renumber([by_id[cid] for cid in data.column_ids])
        await self.uow.commit()
        return [await self._out(owner_id, cid) for cid in data.column_ids]

    async def update(self, owner_id: uuid.UUID, column_id: uuid.UUID, data: ColumnUpdate) -> ColumnOut:
        column = await self.columns.get(column_id, owner_id)
        if column is None:
            raise NotFoundError("Columna no encontrada")
        for field in data.model_fields_set:
            setattr(column, field, getattr(data, field))
        await self.uow.commit()
        return await self._out(owner_id, column_id)

    async def delete(self, owner_id: uuid.UUID, column_id: uuid.UUID) -> None:
        column = await self.columns.get(column_id, owner_id)
        if column is None:
            raise NotFoundError("Columna no encontrada")
        board_id = column.board_id
        await self.boards.lock(board_id)
        column = await self.columns.get(column_id, owner_id)  # puede haberse borrado mientras esperábamos
        if column is None:
            raise NotFoundError("Columna no encontrada")
        await self.columns.delete(column)
        ordering.renumber(await self.columns.list_for_board(board_id))
        await self.uow.commit()
