import uuid

from app.core.errors import NotFoundError, ValidationError
from app.db.models import Task
from app.schemas.tasks import TaskCreate, TaskLabelsIn, TaskMove, TaskOut, TaskUpdate
from app.services import ordering


class TaskService:
    def __init__(self, tasks, columns, labels, boards, uow):
        self.tasks = tasks
        self.columns = columns
        self.labels = labels
        self.boards = boards
        self.uow = uow

    async def _out(self, owner_id: uuid.UUID, task_id: uuid.UUID) -> TaskOut:
        task = await self.tasks.get(task_id, owner_id)
        if task is None:
            raise NotFoundError("Tarea no encontrada")
        return TaskOut.model_validate(task)

    @staticmethod
    def _check_assignee(owner_id: uuid.UUID, assignee_id: uuid.UUID | None) -> None:
        # v1: no hay tableros compartidos, solo el dueño puede ser asignado.
        if assignee_id is not None and assignee_id != owner_id:
            raise ValidationError("assignee_id solo puede ser el dueño del tablero")

    async def create(self, owner_id: uuid.UUID, column_id: uuid.UUID, data: TaskCreate) -> TaskOut:
        column = await self.columns.get(column_id, owner_id)
        if column is None:
            raise NotFoundError("Columna no encontrada")
        self._check_assignee(owner_id, data.assignee_id)
        await self.boards.lock(column.board_id)
        siblings = await self.tasks.list_for_column(column_id)
        task = await self.tasks.add(
            Task(
                column_id=column_id,
                title=data.title,
                description=data.description,
                priority=data.priority,
                due_date=data.due_date,
                assignee_id=data.assignee_id,
                created_by=owner_id,
                position=len(siblings),
            )
        )
        await self.uow.commit()
        return await self._out(owner_id, task.id)

    async def get(self, owner_id: uuid.UUID, task_id: uuid.UUID) -> TaskOut:
        return await self._out(owner_id, task_id)

    async def update(self, owner_id: uuid.UUID, task_id: uuid.UUID, data: TaskUpdate) -> TaskOut:
        task = await self.tasks.get(task_id, owner_id)
        if task is None:
            raise NotFoundError("Tarea no encontrada")
        if "assignee_id" in data.model_fields_set:
            self._check_assignee(owner_id, data.assignee_id)
        for field in data.model_fields_set:
            setattr(task, field, getattr(data, field))
        await self.uow.commit()
        return await self._out(owner_id, task_id)

    async def delete(self, owner_id: uuid.UUID, task_id: uuid.UUID) -> None:
        task = await self.tasks.get(task_id, owner_id)
        if task is None:
            raise NotFoundError("Tarea no encontrada")
        column = await self.columns.get(task.column_id, owner_id)
        await self.boards.lock(column.board_id)
        task = await self.tasks.get(task_id, owner_id)  # refresca tras el bloqueo
        if task is None:
            raise NotFoundError("Tarea no encontrada")
        column_id = task.column_id
        await self.tasks.delete(task)
        ordering.renumber(await self.tasks.list_for_column(column_id))
        await self.uow.commit()

    async def _resolve_move(self, owner_id, task_id, column_id):
        task = await self.tasks.get(task_id, owner_id)
        if task is None:
            raise NotFoundError("Tarea no encontrada")
        source = await self.columns.get(task.column_id, owner_id)
        target = await self.columns.get(column_id, owner_id)
        if target is None:
            raise NotFoundError("Columna no encontrada")
        if target.board_id != source.board_id:
            raise ValidationError("La columna destino debe pertenecer al mismo tablero")
        return task, source, target

    async def move(self, owner_id: uuid.UUID, task_id: uuid.UUID, data: TaskMove) -> TaskOut:
        _, source, _ = await self._resolve_move(owner_id, task_id, data.column_id)
        await self.boards.lock(source.board_id)
        # Se vuelve a resolver tras el bloqueo: otra petición pudo mover o borrar la tarea.
        task, source, target = await self._resolve_move(owner_id, task_id, data.column_id)

        source_tasks = await self.tasks.list_for_column(source.id)
        if target.id == source.id:
            ordering.renumber(ordering.move_within(source_tasks, task, data.position))
        else:
            target_tasks = await self.tasks.list_for_column(target.id)
            new_source, new_target = ordering.move_between(source_tasks, target_tasks, task, data.position)
            task.column_id = target.id
            ordering.renumber(new_source)
            ordering.renumber(new_target)
        await self.uow.commit()
        return await self._out(owner_id, task_id)

    async def set_labels(self, owner_id: uuid.UUID, task_id: uuid.UUID, data: TaskLabelsIn) -> TaskOut:
        task = await self.tasks.get(task_id, owner_id)
        if task is None:
            raise NotFoundError("Tarea no encontrada")
        column = await self.columns.get(task.column_id, owner_id)
        wanted = list(dict.fromkeys(data.label_ids))
        found = await self.labels.get_many(column.board_id, wanted)
        if len(found) != len(wanted):
            raise ValidationError("Todas las etiquetas deben existir y pertenecer al mismo tablero")
        task.labels = found
        await self.uow.commit()
        return await self._out(owner_id, task_id)
