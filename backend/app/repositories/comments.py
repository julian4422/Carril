import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import TaskComment


class CommentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_task(self, task_id: uuid.UUID) -> list[TaskComment]:
        stmt = (
            select(TaskComment)
            .where(TaskComment.task_id == task_id)
            .options(selectinload(TaskComment.author))
            .order_by(TaskComment.created_at, TaskComment.id)
            .execution_options(populate_existing=True)
        )
        return list((await self.session.scalars(stmt)).all())

    async def get(self, comment_id: uuid.UUID) -> TaskComment | None:
        stmt = (
            select(TaskComment)
            .where(TaskComment.id == comment_id)
            .options(selectinload(TaskComment.author))
            .execution_options(populate_existing=True)
        )
        return await self.session.scalar(stmt)

    async def add(self, comment: TaskComment) -> TaskComment:
        self.session.add(comment)
        await self.session.flush()
        return comment
