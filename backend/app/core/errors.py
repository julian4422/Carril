"""Errores de dominio, mapeados a respuestas HTTP `{"detail": ...}`."""
import logging

from fastapi import FastAPI, Request
from sqlalchemy.exc import IntegrityError, InterfaceError, OperationalError
from fastapi.responses import JSONResponse

logger = logging.getLogger("carril")


class DomainError(Exception):
    status_code = 400
    headers: dict[str, str] | None = None

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class NotFoundError(DomainError):
    status_code = 404

    def __init__(self, detail: str = "Recurso no encontrado"):
        super().__init__(detail)


class ConflictError(DomainError):
    status_code = 409


class UnauthorizedError(DomainError):
    status_code = 401
    headers = {"WWW-Authenticate": "Bearer"}

    def __init__(self, detail: str = "No autenticado"):
        super().__init__(detail)


class ValidationError(DomainError):
    """Regla de negocio incumplida (422)."""

    status_code = 422


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _handle(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
        )

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, __: IntegrityError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": "Conflicto al guardar: reintenta la operación"})

    async def _db_down(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Base de datos no disponible"})

    for exc_type in (OperationalError, InterfaceError, OSError):
        app.add_exception_handler(exc_type, _db_down)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error no controlado", exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "Error interno"})
