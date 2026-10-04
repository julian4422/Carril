from fastapi import APIRouter

from app.api.v1.routers import auth, boards, columns, health, labels, tasks

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, boards, columns, tasks, labels):
    api_router.include_router(module.router)
