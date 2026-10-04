import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Board, BoardColumn, Task


class TaskRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, task_id: uuid.UUID, owner_id: uuid.UUID) -> Task | None:
        """Tarea del dueño, con etiquetas y comment_count frescos."""
        stmt = (
            select(Task)
            .join(BoardColumn, Task.column_id == BoardColumn.id)
            .join(Board, BoardColumn.board_id == Board.id)
            .where(Task.id == task_id, Board.owner_id == owner_id)
            .options(selectinload(Task.labels))
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def list_for_column(self, column_id: uuid.UUID) -> list[Task]:
        stmt = select(Task).where(Task.column_id == column_id).order_by(Task.position)
        return list((await self.session.scalars(stmt)).all())

    async def add(self, task: Task) -> Task:
        self.session.add(task)
        await self.session.flush()
        return task

    async def delete(self, task: Task) -> None:
        await self.session.execute(delete(Task).where(Task.id == task.id))
        self.session.expunge(task)
