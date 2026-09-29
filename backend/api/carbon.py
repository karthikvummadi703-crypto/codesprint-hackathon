"""Carbon footprint routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter

from api.deps import CurrentUid
from errors import AppError
from logging_config import get_logger
from schemas import CarbonRequest, DistanceRequest, DistanceResponse
from services import carbon_service

log = get_logger("airguard.api.carbon")
router = APIRouter(prefix="/api/carbon", tags=["carbon"])


@router.post("/estimate-distance", response_model=DistanceResponse)
async def estimate_distance(uid: CurrentUid, payload: DistanceRequest) -> DistanceResponse:
    """Great-circle distance between two named places.

    Authenticated because it consumes a shared, rate-limited geocoding quota and
    would otherwise be an open proxy.
    """
    distance = await carbon_service.estimate_distance(payload.origin, payload.destination)
    if distance is None:
        raise AppError("Could not resolve one or both locations. Try a more specific name.")
    return DistanceResponse(distanceKm=distance)


@router.post("/calculate")
async def calculate(uid: CurrentUid, payload: CarbonRequest) -> dict:
    """CO2e for a trip, with savings measured against the same trip by car."""
    try:
        return await carbon_service.calculate_carbon(
            payload.origin, payload.destination, payload.distanceKm, payload.mode
        )
    except ValueError as exc:
        raise AppError(str(exc)) from exc
