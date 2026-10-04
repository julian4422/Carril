import uuid

from fastapi import APIRouter, Response

from app.api.deps import CommentServiceDep, CurrentUser, TaskServiceDep
from app.schemas.tasks import (
    CommentCreate,
    CommentOut,
    TaskLabelsIn,
    TaskMove,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, user: CurrentUser, svc: TaskServiceDep):
    return await svc.get(user.id, task_id)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: uuid.UUID, data: TaskUpdate, user: CurrentUser, svc: TaskServiceDep):
    return await svc.update(user.id, task_id, data)


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, user: CurrentUser, svc: TaskServiceDep):
    await svc.delete(user.id, task_id)
    return Response(status_code=204)


@router.post("/{task_id}/move", response_model=TaskOut)
async def move_task(task_id: uuid.UUID, data: TaskMove, user: CurrentUser, svc: TaskServiceDep):
    return await svc.move(user.id, task_id, data)


@router.put("/{task_id}/labels", response_model=TaskOut)
async def set_task_labels(task_id: uuid.UUID, data: TaskLabelsIn, user: CurrentUser, svc: TaskServiceDep):
    return await svc.set_labels(user.id, task_id, data)


@router.get("/{task_id}/comments", response_model=list[CommentOut])
async def list_comments(task_id: uuid.UUID, user: CurrentUser, svc: CommentServiceDep):
    return await svc.list(user.id, task_id)


@router.post("/{task_id}/comments", response_model=CommentOut, status_code=201)
async def create_comment(task_id: uuid.UUID, data: CommentCreate, user: CurrentUser, svc: CommentServiceDep):
    return await svc.create(user.id, task_id, data)
