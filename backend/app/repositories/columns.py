import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Board, BoardColumn, Task


class ColumnRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, column_id: uuid.UUID, owner_id: uuid.UUID) -> BoardColumn | None:
        stmt = (
            select(BoardColumn)
            .join(Board, BoardColumn.board_id == Board.id)
            .where(BoardColumn.id == column_id, Board.owner_id == owner_id)
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def get_with_tasks(self, column_id: uuid.UUID, owner_id: uuid.UUID) -> BoardColumn | None:
        stmt = (
            select(BoardColumn)
            .join(Board, BoardColumn.board_id == Board.id)
            .where(BoardColumn.id == column_id, Board.owner_id == owner_id)
            .options(selectinload(BoardColumn.tasks).selectinload(Task.labels))
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def list_for_board(self, board_id: uuid.UUID) -> list[BoardColumn]:
        stmt = select(BoardColumn).where(BoardColumn.board_id == board_id).order_by(BoardColumn.position)
        return list((await self.session.scalars(stmt)).all())

    async def add(self, column: BoardColumn) -> BoardColumn:
        self.session.add(column)
        await self.session.flush()
        return column

    async def delete(self, column: BoardColumn) -> None:
        await self.session.execute(delete(BoardColumn).where(BoardColumn.id == column.id))
        self.session.expunge(column)
