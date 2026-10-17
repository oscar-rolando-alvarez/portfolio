from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from ragplatform.api.deps import AdminDep, ContainerDep, PrincipalDep
from ragplatform.api.schemas import AnswerOut, PrincipalOut, QueryRequest, UsageReport, UsageRow
from ragplatform.domain.errors import DomainError
from ragplatform.domain.models import utcnow
from ragplatform.domain.ports import ChatMessage
from ragplatform.generation.service import answer_to_dict

router = APIRouter(prefix="/v1", tags=["query"])


def _history(req: QueryRequest) -> list[ChatMessage]:
    return [ChatMessage(t.role, t.content) for t in req.history]


@router.post(
    "/query", response_model=AnswerOut, summary="Ask a question; grounded answer with citations"
)
async def query(req: QueryRequest, container: ContainerDep, principal: PrincipalDep) -> AnswerOut:
    answer = await container.answers.answer(
        principal, req.question, _history(req), top_k=req.top_k, use_cache=req.use_cache
    )
    return AnswerOut.model_validate(answer_to_dict(answer))


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.post(
    "/query/stream",
    summary="Server-Sent Events: meta -> token* -> done",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def query_stream(
    req: QueryRequest, container: ContainerDep, principal: PrincipalDep
) -> StreamingResponse:
    async def events() -> AsyncIterator[str]:
        try:
            async for ev in container.answers.stream(
                principal, req.question, _history(req), top_k=req.top_k, use_cache=req.use_cache
            ):
                yield _sse(ev["event"], ev["data"])
        except DomainError as exc:
            yield _sse("error", {"code": exc.code, "detail": str(exc)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get(
    "/usage", response_model=UsageReport, summary="Token usage and estimated cost (tenant admins)"
)
async def usage(
    container: ContainerDep,
    principal: AdminDep,
    days: Annotated[int, Query(ge=1, le=366)] = 30,
) -> UsageReport:
    since = utcnow() - timedelta(days=days)
    rows = [
        UsageRow.model_validate(r)
        for r in await container.ledger.summary(principal.tenant_id, since)
    ]
    return UsageReport(
        tenant_id=principal.tenant_id,
        since=since,
        total_cost_usd=round(sum(r.cost_usd for r in rows), 8),
        rows=rows,
    )


@router.get("/me", response_model=PrincipalOut, tags=["auth"])
async def me(principal: PrincipalDep) -> PrincipalOut:
    return PrincipalOut(
        tenant_id=principal.tenant_id,
        subject=principal.subject,
        groups=sorted(principal.groups),
        roles=sorted(principal.roles),
    )
