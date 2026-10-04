import uuid

from app.core.errors import NotFoundError
from app.db.models import TaskComment
from app.schemas.tasks import CommentCreate, CommentOut


class CommentService:
    def __init__(self, tasks, comments, uow):
        self.tasks = tasks
        self.comments = comments
        self.uow = uow

    async def list(self, owner_id: uuid.UUID, task_id: uuid.UUID) -> list[CommentOut]:
        if await self.tasks.get(task_id, owner_id) is None:
            raise NotFoundError("Tarea no encontrada")
        return [CommentOut.model_validate(c) for c in await self.comments.list_for_task(task_id)]

    async def create(self, owner_id: uuid.UUID, task_id: uuid.UUID, data: CommentCreate) -> CommentOut:
        if await self.tasks.get(task_id, owner_id) is None:
            raise NotFoundError("Tarea no encontrada")
        comment = await self.comments.add(TaskComment(task_id=task_id, author_id=owner_id, body=data.body))
        await self.uow.commit()
        return CommentOut.model_validate(await self.comments.get(comment.id))
