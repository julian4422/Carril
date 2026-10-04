import uuid
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Board, Label


class LabelRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, label_id: uuid.UUID, owner_id: uuid.UUID) -> Label | None:
        stmt = (
            select(Label)
            .join(Board, Label.board_id == Board.id)
            .where(Label.id == label_id, Board.owner_id == owner_id)
        )
        return await self.session.scalar(stmt)

    async def list_for_board(self, board_id: uuid.UUID) -> list[Label]:
        stmt = select(Label).where(Label.board_id == board_id).order_by(Label.name)
        return list((await self.session.scalars(stmt)).all())

    async def get_by_name(self, board_id: uuid.UUID, name: str) -> Label | None:
        return await self.session.scalar(select(Label).where(Label.board_id == board_id, Label.name == name))

    async def get_many(self, board_id: uuid.UUID, ids: Sequence[uuid.UUID]) -> list[Label]:
        if not ids:
            return []
        stmt = select(Label).where(Label.board_id == board_id, Label.id.in_(ids))
        return list((await self.session.scalars(stmt)).all())

    async def add(self, label: Label) -> Label:
        self.session.add(label)
        await self.session.flush()
        return label

    async def delete(self, label: Label) -> None:
        await self.session.execute(delete(Label).where(Label.id == label.id))
        self.session.expunge(label)
