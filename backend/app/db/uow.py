from sqlalchemy.ext.asyncio import AsyncSession


class UnitOfWork:
    """Frontera transaccional: los servicios deciden cuándo confirmar."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()
