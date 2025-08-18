"""Health check endpoints."""
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from app.models.schemas import HealthCheck
from app.services.health import health_service

router = APIRouter()


@router.get("/", response_model=HealthCheck)
async def health_check():
    """Comprehensive health check endpoint."""
    try:
        health_status = await health_service.perform_comprehensive_health_check()
        
        if health_status["status"] == "unhealthy":
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=health_status
            )
        elif health_status["status"] == "warning":
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=health_status
            )
        else:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=health_status
            )
            
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "error": str(e),
                "service": "image-processing-service"
            }
        )


@router.get("/live")
async def liveness_probe():
    """Kubernetes liveness probe endpoint."""
    try:
        status_info = await health_service.check_liveness()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=status_info
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_alive",
                "error": str(e)
            }
        )


@router.get("/ready")
async def readiness_probe():
    """Kubernetes readiness probe endpoint."""
    try:
        readiness_status = await health_service.check_readiness()
        
        if readiness_status["status"] == "ready":
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=readiness_status
            )
        else:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=readiness_status
            )
            
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "error": str(e)
            }
        )


@router.get("/status")
async def get_status():
    """Get current cached status."""
    status_info = health_service.get_current_status()
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=status_info
    )