from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status

from ragplatform.api.deps import ContainerDep, PrincipalDep, WriterDep
from ragplatform.api.schemas import DocumentOut, UploadOut
from ragplatform.domain.errors import DocumentTooLargeError, NotFoundError

router = APIRouter(prefix="/v1/documents", tags=["documents"])


def _split(values: list[str] | None) -> list[str] | None:
    if not values:
        return None
    out = [g.strip() for v in values for g in v.split(",") if g.strip()]
    return out or None


@router.post(
    "",
    response_model=UploadOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a document (PDF, Markdown, HTML, text). Idempotent by content hash.",
    responses={200: {"description": "Unchanged content: existing document returned"}},
)
async def upload_document(
    response: Response,
    container: ContainerDep,
    principal: WriterDep,
    file: Annotated[UploadFile, File(description="The document to ingest")],
    external_id: Annotated[str | None, Form(max_length=512)] = None,
    title: Annotated[str | None, Form(max_length=512)] = None,
    acl_groups: Annotated[
        list[str] | None, Form(description="Groups allowed to read; '*' = whole tenant")
    ] = None,
    redact_pii: Annotated[bool | None, Form()] = None,
) -> UploadOut:
    limit = container.settings.max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise DocumentTooLargeError(f"max upload size is {limit} bytes")
    result = await container.ingestion.submit(
        principal,
        data=data,
        filename=file.filename,
        mime_type=file.content_type,
        external_id=external_id,
        title=title,
        acl_groups=_split(acl_groups),
        redact_pii=redact_pii,
    )
    if result.deduplicated:
        response.status_code = status.HTTP_200_OK
    elif result.job_id is None:
        response.status_code = status.HTTP_201_CREATED
    return UploadOut(
        document=DocumentOut.of(result.document),
        deduplicated=result.deduplicated,
        job_id=result.job_id,
    )


@router.get("", response_model=list[DocumentOut], summary="List documents visible to the caller")
async def list_documents(
    container: ContainerDep,
    principal: PrincipalDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[DocumentOut]:
    docs = await container.documents.list_visible(principal, limit=limit, offset=offset)
    return [DocumentOut.of(d) for d in docs]


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: UUID, container: ContainerDep, principal: PrincipalDep
) -> DocumentOut:
    doc = await container.documents.get(principal.tenant_id, document_id)
    # 404 (not 403) for invisible documents: never confirm that a restricted doc exists
    if doc is None or not principal.can_see(doc.tenant_id, doc.acl_groups):
        raise NotFoundError("document not found")
    return DocumentOut.of(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID, container: ContainerDep, principal: WriterDep
) -> Response:
    doc = await container.documents.get(principal.tenant_id, document_id)
    if doc is None or not principal.can_see(doc.tenant_id, doc.acl_groups):
        raise NotFoundError("document not found")
    await container.documents.delete(principal.tenant_id, document_id)
    await container.documents.bump_corpus_version(principal.tenant_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
