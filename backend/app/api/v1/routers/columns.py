import uuid

from fastapi import APIRouter, Response

from app.api.deps import ColumnServiceDep, CurrentUser, TaskServiceDep
from app.schemas.boards import ColumnOut, ColumnUpdate
from app.schemas.tasks import TaskCreate, TaskOut

router = APIRouter(prefix="/columns", tags=["columns"])


@router.patch("/{column_id}", response_model=ColumnOut)
async def update_column(column_id: uuid.UUID, data: ColumnUpdate, user: CurrentUser, svc: ColumnServiceDep):
    return await svc.update(user.id, column_id, data)


@router.delete("/{column_id}", status_code=204)
async def delete_column(column_id: uuid.UUID, user: CurrentUser, svc: ColumnServiceDep):
    await svc.delete(user.id, column_id)
    return Response(status_code=204)


@router.post("/{column_id}/tasks", response_model=TaskOut, status_code=201)
async def create_task(column_id: uuid.UUID, data: TaskCreate, user: CurrentUser, svc: TaskServiceDep):
    return await svc.create(user.id, column_id, data)
