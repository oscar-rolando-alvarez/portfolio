"""Per-request GraphQL context: DB session, authenticated user, DataLoaders and services."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Sequence
from functools import cached_property
from typing import Any

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.dataloader import DataLoader
from strawberry.fastapi import BaseContext
from strawberry.types import Info as StrawberryInfo

from recommender.models import Item
from recommender.recommendation.service import RecommendationService
from recommender.security import TokenService


class Context(BaseContext):
    def __init__(
        self,
        session: AsyncSession,
        service: RecommendationService,
        tokens: TokenService,
        user_id: uuid.UUID | None,
    ) -> None:
        super().__init__()
        self.session = session
        self.service = service
        self.tokens = tokens
        self.user_id = user_id

    @cached_property
    def item_loader(self) -> DataLoader[uuid.UUID, Item | None]:
        """Batches item lookups so N recommendations cost one query (avoids N+1)."""

        async def load(keys: Sequence[uuid.UUID]) -> list[Item | None]:
            rows = await self.session.scalars(select(Item).where(Item.id.in_(keys)))
            by_id = {item.id: item for item in rows}
            return [by_id.get(key) for key in keys]

        return DataLoader(load_fn=load)


Info = StrawberryInfo[Context, None]


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.database.session_factory() as session:
        yield session


async def get_context(request: Request, session: AsyncSession = Depends(get_session)) -> Context:
    state: Any = request.app.state
    tokens: TokenService = state.tokens
    user_id = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        user_id = tokens.decode(auth[7:].strip())
    return Context(session=session, service=state.recommendations, tokens=tokens, user_id=user_id)
