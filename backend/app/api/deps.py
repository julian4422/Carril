"""Cableado de dependencias: sesión -> repositorios -> servicios, y usuario autenticado."""
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import UnauthorizedError
from app.db.models import User
from app.db.session import get_session
from app.db.uow import UnitOfWork
from app.repositories.boards import BoardRepository
from app.repositories.columns import ColumnRepository
from app.repositories.comments import CommentRepository
from app.repositories.labels import LabelRepository
from app.repositories.tasks import TaskRepository
from app.repositories.users import UserRepository
from app.services.auth_service import AuthService
from app.services.board_service import BoardService
from app.services.column_service import ColumnService
from app.services.comment_service import CommentService
from app.services.label_service import LabelService
from app.services.task_service import TaskService

bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_auth_service(session: SessionDep, settings: SettingsDep) -> AuthService:
    return AuthService(UserRepository(session), UnitOfWork(session), settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    auth: AuthServiceDep,
) -> User:
    if credentials is None:
        raise UnauthorizedError()
    return await auth.authenticate(credentials.credentials)


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_board_service(session: SessionDep) -> BoardService:
    return BoardService(BoardRepository(session), ColumnRepository(session), UnitOfWork(session))


def get_column_service(session: SessionDep) -> ColumnService:
    return ColumnService(BoardRepository(session), ColumnRepository(session), UnitOfWork(session))


def get_task_service(session: SessionDep) -> TaskService:
    return TaskService(
        TaskRepository(session),
        ColumnRepository(session),
        LabelRepository(session),
        BoardRepository(session),
        UnitOfWork(session),
    )


def get_label_service(session: SessionDep) -> LabelService:
    return LabelService(BoardRepository(session), LabelRepository(session), UnitOfWork(session))


def get_comment_service(session: SessionDep) -> CommentService:
    return CommentService(TaskRepository(session), CommentRepository(session), UnitOfWork(session))


BoardServiceDep = Annotated[BoardService, Depends(get_board_service)]
ColumnServiceDep = Annotated[ColumnService, Depends(get_column_service)]
TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
LabelServiceDep = Annotated[LabelService, Depends(get_label_service)]
CommentServiceDep = Annotated[CommentService, Depends(get_comment_service)]
