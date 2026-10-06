from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.errors import UnhandledErrorMiddleware, register_error_handlers
from app.db.session import dispose_engine

GZIP_MINIMUM_SIZE = 1000  # bytes; las respuestas más pequeñas salen sin comprimir


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(title="Carril API", version="1.0.0", lifespan=lifespan)
    # add_middleware apila hacia fuera: el último añadido es el más externo. Orden resultante
    # (de fuera hacia dentro): GZip -> CORS -> UnhandledError -> manejadores de excepción -> routers.
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=GZIP_MINIMUM_SIZE)
    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
