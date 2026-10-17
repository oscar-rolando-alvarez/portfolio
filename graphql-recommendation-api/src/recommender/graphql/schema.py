"""GraphQL schema: queries and mutations."""

from __future__ import annotations

from typing import Any

import strawberry
from graphql import GraphQLError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from strawberry.exceptions import StrawberryGraphQLError
from strawberry.extensions import MaskErrors, MaxAliasesLimiter, QueryDepthLimiter
from strawberry.permission import BasePermission

from recommender import models
from recommender.graphql.context import Info
from recommender.graphql.types import (
    AuthPayload,
    InteractionPayload,
    ItemInput,
    ItemType,
    Recommendation,
    UserType,
    parse_id,
)
from recommender.recommendation.base import Scored, Strategy
from recommender.security import hash_password, verify_password

MAX_LIMIT = 50


class IsAuthenticated(BasePermission):
    message = "Authentication required"

    def has_permission(self, source: Any, info: Info, **kwargs: Any) -> bool:
        return info.context.user_id is not None


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


async def _hydrate(info: Info, scored: list[Scored]) -> list[Recommendation]:
    items = await info.context.item_loader.load_many([s.item_id for s in scored])
    return [
        Recommendation(item=ItemType.from_model(item), score=round(s.score, 6), reason=s.reason)
        for s, item in zip(scored, items, strict=True)
        if item is not None
    ]


def _auth_payload(info: Info, user: models.User) -> AuthPayload:
    return AuthPayload(token=info.context.tokens.create(user.id), user=UserType.from_model(user))


@strawberry.type
class Query:
    @strawberry.field(description="Fetch a single item by id")
    async def item(self, info: Info, id: strawberry.ID) -> ItemType | None:
        item = await info.context.item_loader.load(parse_id(id))
        return ItemType.from_model(item) if item else None

    @strawberry.field(description="List catalog items, optionally filtered by category")
    async def items(
        self, info: Info, category: str | None = None, limit: int = 20, offset: int = 0
    ) -> list[ItemType]:
        stmt = select(models.Item).order_by(models.Item.title)
        if category:
            stmt = stmt.where(func.lower(models.Item.category) == category.lower())
        rows = await info.context.session.scalars(stmt.limit(_clamp(limit)).offset(max(offset, 0)))
        return [ItemType.from_model(i) for i in rows]

    @strawberry.field(permission_classes=[IsAuthenticated], description="The current user")
    async def me(self, info: Info) -> UserType | None:
        user = await info.context.session.get(models.User, info.context.user_id)
        return UserType.from_model(user) if user else None

    @strawberry.field(
        permission_classes=[IsAuthenticated],
        description="Personalized recommendations for the current user",
    )
    async def recommendations(
        self, info: Info, strategy: Strategy = Strategy.HYBRID, limit: int = 10
    ) -> list[Recommendation]:
        assert info.context.user_id is not None
        scored = await info.context.service.recommend(info.context.user_id, strategy, _clamp(limit))
        return await _hydrate(info, scored)

    @strawberry.field(
        description="Items similar to the given item (semantic + content + co-engagement)"
    )
    async def similar_items(
        self, info: Info, item_id: strawberry.ID, limit: int = 10
    ) -> list[Recommendation]:
        scored = await info.context.service.similar_items(parse_id(item_id), _clamp(limit))
        return await _hydrate(info, scored)

    @strawberry.field(description="Natural-language search over the catalog using embeddings")
    async def semantic_search(
        self, info: Info, query: str, limit: int = 10
    ) -> list[Recommendation]:
        text = query.strip()
        if not text:
            return []
        scored = await info.context.service.semantic_search(text[:500], _clamp(limit))
        return await _hydrate(info, scored)


@strawberry.type
class Mutation:
    @strawberry.mutation(description="Create an account and return an access token")
    async def register(self, info: Info, email: str, username: str, password: str) -> AuthPayload:
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters")
        if "@" not in email:
            raise ValueError("Invalid email address")
        session = info.context.session
        user = models.User(
            email=email.lower(), username=username, password_hash=hash_password(password)
        )
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise ValueError("Email already registered") from None
        return AuthPayload(
            token=info.context.tokens.create(user.id), user=UserType.from_model(user)
        )

    @strawberry.mutation(description="Exchange credentials for an access token")
    async def login(self, info: Info, email: str, password: str) -> AuthPayload:
        user = await info.context.session.scalar(
            select(models.User).where(models.User.email == email.lower())
        )
        if user is None or not verify_password(password, user.password_hash):
            raise ValueError("Invalid credentials")
        return AuthPayload(
            token=info.context.tokens.create(user.id), user=UserType.from_model(user)
        )

    @strawberry.mutation(permission_classes=[IsAuthenticated], description="Add a catalog item")
    async def create_item(self, info: Info, input: ItemInput) -> ItemType:
        item = models.Item(
            title=input.title.strip(),
            description=input.description.strip(),
            category=input.category.strip(),
            tags=[t.strip().lower() for t in input.tags if t.strip()],
        )
        info.context.session.add(item)
        await info.context.session.commit()
        await info.context.service.index_items([item])
        info.context.service.invalidate()
        return ItemType.from_model(item)

    @strawberry.mutation(
        permission_classes=[IsAuthenticated], description="Record user feedback on an item"
    )
    async def record_interaction(
        self,
        info: Info,
        item_id: strawberry.ID,
        type: models.InteractionType,
        value: float | None = None,
    ) -> InteractionPayload:
        assert info.context.user_id is not None
        item_uuid = parse_id(item_id)
        if await info.context.session.get(models.Item, item_uuid) is None:
            raise ValueError("Item not found")
        if type is models.InteractionType.RATING and (value is None or not 1 <= value <= 5):
            raise ValueError("Ratings require a value between 1 and 5")
        interaction = models.Interaction(
            user_id=info.context.user_id,
            item_id=item_uuid,
            type=type,
            value=value if value is not None else 1.0,
        )
        info.context.session.add(interaction)
        await info.context.session.commit()
        info.context.service.invalidate()
        return InteractionPayload(
            id=strawberry.ID(str(interaction.id)),
            item_id=item_id,
            type=interaction.type,
            value=interaction.value,
        )


def _should_mask_error(error: GraphQLError) -> bool:
    """Expose validation/permission messages; hide unexpected internal errors."""
    original = error.original_error
    return original is not None and not isinstance(
        original, ValueError | StrawberryGraphQLError | PermissionError
    )


def build_schema(max_depth: int = 8) -> strawberry.Schema:
    return strawberry.Schema(
        query=Query,
        mutation=Mutation,
        extensions=[
            lambda: QueryDepthLimiter(max_depth=max_depth),
            lambda: MaxAliasesLimiter(max_alias_count=20),
            lambda: MaskErrors(should_mask_error=_should_mask_error),
        ],
    )
