from fastapi import APIRouter

from app.api.deps import AuthServiceDep, CurrentUser
from app.schemas.auth import LoginIn, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(data: RegisterIn, auth: AuthServiceDep):
    return await auth.register(data)


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, auth: AuthServiceDep):
    return await auth.login(data)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
