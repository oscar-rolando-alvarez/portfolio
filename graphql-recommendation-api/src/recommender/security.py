"""Password hashing (bcrypt) and JWT access tokens (PyJWT)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


class TokenService:
    def __init__(self, secret: str, algorithm: str = "HS256", expire_minutes: int = 60) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self.expire_minutes = expire_minutes

    def create(self, user_id: uuid.UUID, *, expires_in: timedelta | None = None) -> str:
        now = datetime.now(UTC)
        payload = {
            "sub": str(user_id),
            "iat": now,
            "exp": now + (expires_in or timedelta(minutes=self.expire_minutes)),
            "type": "access",
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def decode(self, token: str) -> uuid.UUID | None:
        """Return the subject user id, or None for any invalid/expired token."""
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
            if payload.get("type") != "access":
                return None
            return uuid.UUID(str(payload["sub"]))
        except (jwt.InvalidTokenError, KeyError, ValueError):
            return None
