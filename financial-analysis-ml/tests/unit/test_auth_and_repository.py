"""Tests for JWT handling, password value object and the SQLAlchemy user repository."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from financial_analysis.application.services.auth_service import AuthService
from financial_analysis.domain.entities.user import User
from financial_analysis.domain.exceptions.user_exceptions import UserAlreadyExistsException
from financial_analysis.domain.value_objects.password import Password
from financial_analysis.infrastructure.database.repositories.user_repository_impl import (
    UserRepositoryImpl,
)


class TestAuthService:
    def test_access_token_roundtrip(self, auth_service: AuthService):
        user_id = str(uuid4())
        token = auth_service.create_access_token(user_id)

        assert auth_service.verify_token(token) == user_id
        assert auth_service.token_expires_in == 30 * 60

    def test_refresh_token_is_not_an_access_token(self, auth_service: AuthService):
        user_id = str(uuid4())
        refresh = auth_service.create_refresh_token(user_id)

        assert auth_service.verify_refresh_token(refresh) == user_id
        assert auth_service.verify_token(refresh) is None
        access = auth_service.create_access_token(user_id)
        assert auth_service.verify_refresh_token(access) is None

    def test_expired_and_tampered_tokens_are_rejected(self, auth_service: AuthService):
        expired = auth_service.create_access_token("u", expires_delta=timedelta(seconds=-1))
        other = AuthService(secret_key="another-secret-key-with-32-bytes-min!!")

        assert auth_service.verify_token(expired) is None
        assert auth_service.verify_token(other.create_access_token("u")) is None
        assert auth_service.verify_refresh_token("garbage") is None


class TestPassword:
    def test_hash_and_verify(self):
        password = Password("Str0ng!Pass")
        hashed = password.hash()

        assert password.verify(hashed)
        assert not Password("0ther!Pass").verify(hashed)

    @pytest.mark.parametrize("value", ["", "Sh0rt!", "alllowercase1!", "NoDigits!!", "NoSpecial11"])
    def test_rejects_weak_passwords(self, value: str):
        with pytest.raises(ValueError):
            Password(value)

    def test_generate_random_meets_policy(self):
        generated = Password.generate_random(16)

        assert len(generated.value) == 16
        with pytest.raises(ValueError):
            Password.generate_random(4)


class TestUserRepository:
    @staticmethod
    def _user(email: str = "repo@example.com") -> User:
        return User.create(
            email=email,
            password="Str0ng!Pass",
            first_name="Ada",
            last_name="Lovelace",
        )

    async def test_crud_roundtrip(self, test_db: AsyncSession):
        repo = UserRepositoryImpl(test_db)
        created = await repo.create(self._user())

        assert (await repo.get_by_id(created.id)) is not None
        assert (await repo.get_by_email("repo@example.com")) is not None
        assert await repo.exists_by_email("repo@example.com")
        assert not await repo.exists_by_email("missing@example.com")

        created.update_profile(first_name="Augusta")
        updated = await repo.update(created)
        assert updated.first_name == "Augusta"

        assert [u.id for u in await repo.list()] == [created.id]
        assert await repo.delete(created.id)
        assert await repo.get_by_id(created.id) is None
        assert not await repo.delete(created.id)

    async def test_duplicate_email_raises(self, test_db: AsyncSession):
        repo = UserRepositoryImpl(test_db)
        await repo.create(self._user())

        with pytest.raises(UserAlreadyExistsException):
            await repo.create(self._user())
