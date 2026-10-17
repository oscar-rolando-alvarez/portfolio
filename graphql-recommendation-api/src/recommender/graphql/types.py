"""Strawberry GraphQL types."""

from __future__ import annotations

import uuid
from datetime import datetime

import strawberry

from recommender import models
from recommender.recommendation.base import Strategy

# Expose the domain enums directly in the schema.
strawberry.enum(Strategy, description="Recommendation strategy")
strawberry.enum(models.InteractionType, description="Kind of user feedback")


@strawberry.type(description="A catalog item that can be recommended")
class ItemType:
    id: strawberry.ID
    title: str
    description: str
    category: str
    tags: list[str]
    created_at: datetime

    @classmethod
    def from_model(cls, item: models.Item) -> ItemType:
        return cls(
            id=strawberry.ID(str(item.id)),
            title=item.title,
            description=item.description,
            category=item.category,
            tags=list(item.tags),
            created_at=item.created_at,
        )


@strawberry.type
class UserType:
    id: strawberry.ID
    email: str
    username: str

    @classmethod
    def from_model(cls, user: models.User) -> UserType:
        return cls(id=strawberry.ID(str(user.id)), email=user.email, username=user.username)


@strawberry.type(description="A recommended item with its score and a human-readable reason")
class Recommendation:
    item: ItemType
    score: float
    reason: str


@strawberry.type
class AuthPayload:
    token: str
    user: UserType


@strawberry.type
class InteractionPayload:
    id: strawberry.ID
    item_id: strawberry.ID
    type: models.InteractionType
    value: float


@strawberry.input
class ItemInput:
    title: str
    description: str = ""
    category: str
    tags: list[str] = strawberry.field(default_factory=list)


def parse_id(value: strawberry.ID | str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError as exc:
        raise ValueError(f"Invalid id: {value}") from exc
