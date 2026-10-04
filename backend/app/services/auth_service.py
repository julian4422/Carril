import uuid

from sqlalchemy.exc import IntegrityError

from app.core import security
from app.core.config import Settings
from app.core.errors import ConflictError, UnauthorizedError
from app.db.models import User
from app.schemas.auth import LoginIn, RegisterIn, TokenOut, UserOut

# Hash válido de una clave aleatoria: iguala el tiempo de respuesta cuando el email no existe.
_DUMMY_HASH = security.hash_password("dummy-password", rounds=4)


class AuthService:
    def __init__(self, users, uow, settings: Settings):
        self.users = users
        self.uow = uow
        self.settings = settings

    async def register(self, data: RegisterIn) -> UserOut:
        if await self.users.get_by_email(data.email):
            raise ConflictError("El email ya está registrado")
        user = User(
            email=data.email,
            full_name=data.full_name,
            password_hash=security.hash_password(data.password, self.settings.bcrypt_rounds),
        )
        try:
            await self.users.add(user)
            await self.uow.commit()
        except IntegrityError:
            await self.uow.rollback()
            raise ConflictError("El email ya está registrado") from None
        return UserOut.model_validate(await self.users.get_by_id(user.id))

    async def login(self, data: LoginIn) -> TokenOut:
        user = await self.users.get_by_email(data.email.strip())
        if user is None:
            security.verify_password(data.password, _DUMMY_HASH)
            raise UnauthorizedError("Credenciales inválidas")
        if not security.verify_password(data.password, user.password_hash):
            raise UnauthorizedError("Credenciales inválidas")
        token = security.create_access_token(
            str(user.id),
            self.settings.jwt_secret,
            self.settings.jwt_expires_minutes,
            self.settings.jwt_algorithm,
        )
        return TokenOut(
            access_token=token,
            expires_in=self.settings.jwt_expires_minutes * 60,
            user=UserOut.model_validate(user),
        )

    async def authenticate(self, token: str):
        """Devuelve el usuario dueño del token o lanza UnauthorizedError."""
        subject = security.decode_access_token(token, self.settings.jwt_secret, self.settings.jwt_algorithm)
        try:
            user_id = uuid.UUID(subject)
        except ValueError:
            raise UnauthorizedError("Token inválido") from None
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise UnauthorizedError("Token inválido")
        return user
