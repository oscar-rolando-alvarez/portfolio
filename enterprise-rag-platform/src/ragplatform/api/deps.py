"""FastAPI dependencies: container access and authentication."""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import Depends, Request, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from ragplatform.api.auth import Authenticator
from ragplatform.container import Container
from ragplatform.domain.errors import AuthenticationError, PermissionDeniedError
from ragplatform.domain.models import Principal

bearer = HTTPBearer(auto_error=False, description="OIDC/JWT access token with tid/groups/roles")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="rag_<id>_<secret>")


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


def get_authenticator(request: Request) -> Authenticator:
    auth: Authenticator = request.app.state.authenticator
    return auth


async def get_principal(
    auth: Annotated[Authenticator, Depends(get_authenticator)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)] = None,
    api_key: Annotated[str | None, Security(api_key_header)] = None,
) -> Principal:
    if creds is not None and creds.scheme.lower() == "bearer":
        principal = auth.verify_jwt(creds.credentials)
    elif api_key:
        principal = await auth.verify_api_key(api_key)
    else:
        raise AuthenticationError("missing credentials (Bearer token or X-API-Key)")
    structlog.contextvars.bind_contextvars(tenant=principal.tenant_id, subject=principal.subject)
    return principal


async def require_writer(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
    if not principal.can_write:
        raise PermissionDeniedError("editor or admin role required")
    return principal


async def require_admin(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
    if not principal.is_admin:
        raise PermissionDeniedError("admin role required")
    return principal


ContainerDep = Annotated[Container, Depends(get_container)]
PrincipalDep = Annotated[Principal, Depends(get_principal)]
WriterDep = Annotated[Principal, Depends(require_writer)]
AdminDep = Annotated[Principal, Depends(require_admin)]
