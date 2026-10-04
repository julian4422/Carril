import uuid

from app.core.errors import NotFoundError
from app.db.models import Board, BoardColumn
from app.schemas.boards import BoardCreate, BoardDetail, BoardSummary, BoardUpdate

DEFAULT_COLUMNS = ("Por hacer", "En curso", "Hecho")


class BoardService:
    def __init__(self, boards, columns, uow):
        self.boards = boards
        self.columns = columns
        self.uow = uow

    async def list(self, owner_id: uuid.UUID) -> list[BoardSummary]:
        rows = await self.boards.list_summaries(owner_id)
        return [
            BoardSummary(
                id=b.id,
                name=b.name,
                description=b.description,
                color=b.color,
                created_at=b.created_at,
                updated_at=b.updated_at,
                column_count=cc,
                task_count=tc,
            )
            for b, cc, tc in rows
        ]

    async def create(self, owner_id: uuid.UUID, data: BoardCreate) -> BoardDetail:
        board = await self.boards.add(
            Board(owner_id=owner_id, name=data.name, description=data.description, color=data.color)
        )
        for position, name in enumerate(DEFAULT_COLUMNS):
            await self.columns.add(BoardColumn(board_id=board.id, name=name, position=position))
        await self.uow.commit()
        return await self.get(owner_id, board.id)

    async def get(self, owner_id: uuid.UUID, board_id: uuid.UUID) -> BoardDetail:
        board = await self.boards.get_detail(board_id, owner_id)
        if board is None:
            raise NotFoundError("Tablero no encontrado")
        return BoardDetail.model_validate(board)

    async def update(self, owner_id: uuid.UUID, board_id: uuid.UUID, data: BoardUpdate) -> BoardDetail:
        board = await self.boards.get(board_id, owner_id)
        if board is None:
            raise NotFoundError("Tablero no encontrado")
        for field in data.model_fields_set:
            setattr(board, field, getattr(data, field))
        await self.uow.commit()
        return await self.get(owner_id, board_id)

    async def delete(self, owner_id: uuid.UUID, board_id: uuid.UUID) -> None:
        board = await self.boards.get(board_id, owner_id)
        if board is None:
            raise NotFoundError("Tablero no encontrado")
        await self.boards.delete(board)
        await self.uow.commit()
