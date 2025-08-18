"""Prometheus metrics endpoint."""
from fastapi import APIRouter
from fastapi.responses import Response

from app.core.config import settings
from app.services.metrics import metrics_collector

router = APIRouter()


@router.get(settings.PROMETHEUS_METRICS_PATH.lstrip("/"), 
           include_in_schema=False)
async def get_metrics():
    """Prometheus metrics endpoint."""
    if not settings.ENABLE_METRICS:
        return Response(
            content="Metrics collection disabled",
            status_code=404
        )
    
    metrics_data = metrics_collector.get_metrics()
    return Response(
        content=metrics_data,
        media_type=metrics_collector.get_content_type()
    )