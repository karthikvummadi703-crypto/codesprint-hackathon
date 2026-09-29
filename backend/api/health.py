"""Health and capability reporting."""

from __future__ import annotations

from fastapi import APIRouter

from api.deps import env_cache
from config import describe_configuration, get_settings
from schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness plus a capability report.

    Reports only whether credentials are *present* — never any secret material.
    """
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service="airguard-backend",
        version="2.0.0",
        capabilities=describe_configuration(settings),
        cache=env_cache.stats(),
    )
