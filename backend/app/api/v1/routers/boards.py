import uuid

from fastapi import APIRouter, Response

from app.api.deps import BoardServiceDep, ColumnServiceDep, CurrentUser, LabelServiceDep
from app.schemas.boards import (
    BoardCreate,
    BoardDetail,
    BoardSummary,
    BoardUpdate,
    ColumnCreate,
    ColumnOrderIn,
    ColumnOut,
)
from app.schemas.labels import LabelCreate, LabelOut

router = APIRouter(prefix="/boards", tags=["boards"])


@router.get("", response_model=list[BoardSummary])
async def list_boards(user: CurrentUser, svc: BoardServiceDep):
    return await svc.list(user.id)


@router.post("", response_model=BoardDetail, status_code=201)
async def create_board(data: BoardCreate, user: CurrentUser, svc: BoardServiceDep):
    return await svc.create(user.id, data)


@router.get("/{board_id}", response_model=BoardDetail)
async def get_board(board_id: uuid.UUID, user: CurrentUser, svc: BoardServiceDep):
    return await svc.get(user.id, board_id)


@router.patch("/{board_id}", response_model=BoardDetail)
async def update_board(board_id: uuid.UUID, data: BoardUpdate, user: CurrentUser, svc: BoardServiceDep):
    return await svc.update(user.id, board_id, data)


@router.delete("/{board_id}", status_code=204)
async def delete_board(board_id: uuid.UUID, user: CurrentUser, svc: BoardServiceDep):
    await svc.delete(user.id, board_id)
    return Response(status_code=204)


@router.post("/{board_id}/columns", response_model=ColumnOut, status_code=201)
async def create_column(board_id: uuid.UUID, data: ColumnCreate, user: CurrentUser, svc: ColumnServiceDep):
    return await svc.create(user.id, board_id, data)


@router.put("/{board_id}/columns/order", response_model=list[ColumnOut])
async def reorder_columns(board_id: uuid.UUID, data: ColumnOrderIn, user: CurrentUser, svc: ColumnServiceDep):
    return await svc.reorder(user.id, board_id, data)


@router.get("/{board_id}/labels", response_model=list[LabelOut])
async def list_labels(board_id: uuid.UUID, user: CurrentUser, svc: LabelServiceDep):
    return await svc.list(user.id, board_id)


@router.post("/{board_id}/labels", response_model=LabelOut, status_code=201)
async def create_label(board_id: uuid.UUID, data: LabelCreate, user: CurrentUser, svc: LabelServiceDep):
    return await svc.create(user.id, board_id, data)
