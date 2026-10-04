import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Board, BoardColumn, Task


class BoardRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_summaries(self, owner_id: uuid.UUID) -> list[tuple[Board, int, int]]:
        """Tableros no archivados con column_count y task_count en una sola consulta."""
        col_count = (
            select(func.count(BoardColumn.id)).where(BoardColumn.board_id == Board.id).scalar_subquery()
        )
        task_count = (
            select(func.count(Task.id))
            .join(BoardColumn, Task.column_id == BoardColumn.id)
            .where(BoardColumn.board_id == Board.id)
            .scalar_subquery()
        )
        stmt = (
            select(Board, col_count, task_count)
            .where(Board.owner_id == owner_id, Board.archived_at.is_(None))
            .order_by(Board.created_at.desc(), Board.id)
            .execution_options(populate_existing=True)
        )
        return [(b, int(c), int(t)) for b, c, t in (await self.session.execute(stmt)).all()]

    async def get(self, board_id: uuid.UUID, owner_id: uuid.UUID) -> Board | None:
        stmt = select(Board).where(Board.id == board_id, Board.owner_id == owner_id)
        return await self.session.scalar(stmt)

    async def get_detail(self, board_id: uuid.UUID, owner_id: uuid.UUID) -> Board | None:
        """Tablero completo (columnas, tareas, etiquetas) en 4 consultas, sin N+1."""
        stmt = (
            select(Board)
            .where(Board.id == board_id, Board.owner_id == owner_id)
            .options(
                selectinload(Board.columns).selectinload(BoardColumn.tasks).selectinload(Task.labels),
                selectinload(Board.labels),
            )
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def lock(self, board_id: uuid.UUID) -> None:
        """Bloquea la fila del tablero hasta el fin de la transacción (serializa cambios de posiciones)."""
        await self.session.execute(select(Board.id).where(Board.id == board_id).with_for_update())

    async def add(self, board: Board) -> Board:
        self.session.add(board)
        await self.session.flush()
        return board

    async def delete(self, board: Board) -> None:
        await self.session.execute(delete(Board).where(Board.id == board.id))
        self.session.expunge(board)
