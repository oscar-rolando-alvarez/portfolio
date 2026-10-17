"""Authentication: OIDC-style JWT bearer tokens or hashed API keys.

Both resolve to a ``Principal`` (tenant + groups + roles). The tenant is *never* taken
from the request body or URL: it only comes from a verified credential.

JWT claims: ``sub``, ``tid`` (tenant), ``groups`` (list), ``roles`` (list), ``iss``,
``aud``, ``exp``. API keys look like ``rag_<key_id>_<secret>`` and are stored as SHA-256
hashes (they are high-entropy, so a slow KDF is unnecessary).
"""

from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any

import jwt

from ragplatform.config import Settings
from ragplatform.domain.errors import AuthenticationError
from ragplatform.domain.models import ApiKeyRecord, Principal, Role
from ragplatform.domain.ports import ApiKeyStore

_VALID_ROLES = {r.value for r in Role}


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Returns ``(key_id, plaintext_key)``. The plaintext is shown exactly once."""
    key_id = secrets.token_hex(4)
    return key_id, f"rag_{key_id}_{secrets.token_urlsafe(32)}"


def mint_token(
    settings: Settings,
    *,
    tenant_id: str,
    subject: str,
    groups: list[str],
    roles: list[str],
    ttl_s: int = 3600,
) -> str:
    """Issue an HS256 token for local development and tests (production uses your IdP)."""
    now = int(time.time())
    claims = {
        "sub": subject,
        "tid": tenant_id,
        "groups": groups,
        "roles": roles,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + ttl_s,
    }
    return jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm="HS256")


def _principal(tenant: Any, subject: Any, groups: Any, roles: Any) -> Principal:
    if not isinstance(tenant, str) or not tenant or not isinstance(subject, str) or not subject:
        raise AuthenticationError("credential lacks tenant or subject")
    if not isinstance(groups, list) or not all(isinstance(g, str) for g in groups):
        raise AuthenticationError("groups claim must be a list of strings")
    if not isinstance(roles, list):
        raise AuthenticationError("roles claim must be a list of strings")
    clean_roles = frozenset(r for r in roles if r in _VALID_ROLES) or frozenset({Role.READER.value})
    return Principal(tenant, subject, frozenset(groups), clean_roles)


class Authenticator:
    def __init__(self, settings: Settings, api_keys: ApiKeyStore) -> None:
        self._s = settings
        self._keys = api_keys

    def verify_jwt(self, token: str) -> Principal:
        alg = self._s.jwt_algorithm
        key = (
            self._s.jwt_secret.get_secret_value()
            if alg.startswith("HS")
            else (self._s.jwt_public_key or "")
        )
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience=self._s.jwt_audience,
                issuer=self._s.jwt_issuer,
                options={"require": ["exp", "sub", "iss", "aud"]},
                leeway=30,
            )
        except jwt.PyJWTError as exc:
            raise AuthenticationError(f"invalid token: {exc}") from exc
        return _principal(
            claims.get("tid"), claims.get("sub"), claims.get("groups", []), claims.get("roles", [])
        )

    async def verify_api_key(self, key: str) -> Principal:
        if not key.startswith("rag_") or len(key) < 20:
            raise AuthenticationError("malformed API key")
        record = await self._keys.find_by_hash(hash_api_key(key))
        if record is None or record.revoked:
            raise AuthenticationError("unknown or revoked API key")
        return _principal(record.tenant_id, f"apikey:{record.key_id}", record.groups, record.roles)

    async def create_api_key(
        self, *, tenant_id: str, name: str, groups: list[str], roles: list[str]
    ) -> str:
        key_id, key = generate_api_key()
        await self._keys.create(
            ApiKeyRecord(key_id=key_id, tenant_id=tenant_id, name=name, groups=groups, roles=roles),
            hash_api_key(key),
        )
        return key
