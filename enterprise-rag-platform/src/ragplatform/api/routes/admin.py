from __future__ import annotations

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

from ragplatform.api.auth import Authenticator
from ragplatform.api.deps import AdminDep
from ragplatform.domain.errors import PermissionDeniedError
from ragplatform.domain.models import Role

router = APIRouter(prefix="/v1/admin", tags=["admin"])


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    groups: list[str] = Field(default_factory=list, max_length=100)
    roles: list[Role] = Field(default_factory=lambda: [Role.READER])


class ApiKeyCreated(BaseModel):
    api_key: str = Field(description="Shown once; only its SHA-256 hash is stored")
    tenant_id: str


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyCreate, request: Request, principal: AdminDep
) -> ApiKeyCreated:
    """Create a service API key scoped to the caller's tenant (admins only)."""
    if Role.ADMIN in body.roles and not principal.is_admin:  # pragma: no cover - AdminDep
        raise PermissionDeniedError("only admins can mint admin keys")
    auth: Authenticator = request.app.state.authenticator
    key = await auth.create_api_key(
        tenant_id=principal.tenant_id,
        name=body.name,
        groups=body.groups,
        roles=[r.value for r in body.roles],
    )
    return ApiKeyCreated(api_key=key, tenant_id=principal.tenant_id)
