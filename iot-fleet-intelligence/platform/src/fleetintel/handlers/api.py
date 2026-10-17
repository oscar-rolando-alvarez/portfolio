"""Incident & cost API Lambda (API Gateway HTTP API, payload v2).

Authentication: ``x-api-key`` header. Only SHA-256 hashes of keys are
configured (``FLEETINTEL_API_KEYS=tenant:<sha256>``); each key maps to exactly
one tenant and every query is scoped to it. Cross-tenant reads return 404 so
incident ids cannot be probed.
"""

from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal
from typing import Any

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, CORSConfig, Response
from aws_lambda_powertools.event_handler.exceptions import (
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
)
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from pydantic import ValidationError

from fleetintel import __version__
from fleetintel.bootstrap import get_container
from fleetintel.cost.model import CENT, FleetProfile, estimate
from fleetintel.cost.report import SCENARIOS
from fleetintel.domain import IncidentStatus

logger = Logger(service="fleetintel-api")
tracer = Tracer(service="fleetintel-api")
app = APIGatewayHttpResolver(
    cors=CORSConfig(allow_origin="*", allow_headers=["x-api-key", "content-type"], max_age=300)
)


def _tenant() -> str:
    key = app.current_event.headers.get("x-api-key", "")
    if not key:
        raise UnauthorizedError("missing x-api-key")
    digest = hashlib.sha256(key.encode()).hexdigest()
    index = get_container().settings.api_key_index()
    for known, tenant in index.items():
        if hmac.compare_digest(known, digest):
            logger.append_keys(tenant=tenant)
            return tenant
    raise UnauthorizedError("invalid api key")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "version": __version__}


@app.get("/ready")
def ready() -> Response[Any]:
    ok = get_container().repo.ping()
    return Response(
        status_code=200 if ok else 503, content_type="application/json", body={"ready": ok}
    )


@app.get("/v1/incidents")
def list_incidents() -> dict[str, Any]:
    tenant = _tenant()
    c = get_container()
    q = app.current_event.query_string_parameters or {}
    status = None
    if q.get("status"):
        try:
            status = IncidentStatus(q["status"].upper())
        except ValueError as exc:
            raise BadRequestError(
                f"status must be one of {[s.value for s in IncidentStatus]}"
            ) from exc
    try:
        limit = min(max(int(q.get("limit", "25")), 1), c.settings.max_page_size)
    except ValueError as exc:
        raise BadRequestError("limit must be an integer") from exc
    try:
        items, cursor = c.repo.list_incidents(tenant, status, limit, q.get("cursor"))
    except ValueError as exc:
        raise BadRequestError(str(exc)) from exc
    return {"items": [i.model_dump(mode="json") for i in items], "next_cursor": cursor}


@app.get("/v1/incidents/<incident_id>")
def get_incident(incident_id: str) -> dict[str, Any]:
    tenant = _tenant()
    if not incident_id.startswith("inc-") or len(incident_id) > 64:
        raise NotFoundError("incident not found")
    incident, enrichment, diagnoses = get_container().repo.get_bundle(incident_id)
    if incident is None or incident.tenant != tenant:
        raise NotFoundError("incident not found")
    latest = max(diagnoses, key=lambda d: d.created_at) if diagnoses else None
    return {
        "incident": incident.model_dump(mode="json"),
        "enrichment": enrichment.model_dump(mode="json") if enrichment else None,
        "diagnosis": latest.model_dump(mode="json") if latest else None,
        "diagnosis_history": len(diagnoses),
    }


@app.post("/v1/cost/estimate")
def cost_estimate() -> dict[str, Any]:
    _tenant()
    try:
        profile = FleetProfile.model_validate(app.current_event.json_body or {})
    except ValidationError as exc:
        raise BadRequestError(exc.json(include_url=False, include_input=False)) from exc
    return estimate(profile).model_dump(mode="json")


@app.get("/v1/cost/scenarios")
def cost_scenarios() -> dict[str, Any]:
    _tenant()
    out = []
    for n in SCENARIOS:
        r = estimate(FleetProfile(devices=n), with_recommendations=False)
        out.append(
            {
                "devices": n,
                "total_usd": str(r.total_usd.quantize(CENT)),
                "per_device_usd": str(r.per_device_usd.quantize(Decimal("0.0001"))),
                "by_category": {k: str(v.quantize(CENT)) for k, v in r.by_category.items()},
            }
        )
    return {"pricing_version": r.pricing_version, "scenarios": out}


@logger.inject_lambda_context(
    correlation_id_path=correlation_paths.API_GATEWAY_HTTP, clear_state=True
)
@tracer.capture_lambda_handler(capture_response=False)
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return app.resolve(event, context)
