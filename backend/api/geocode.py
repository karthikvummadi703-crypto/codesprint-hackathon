"""Geocoding routes for the location search box."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from api.deps import CurrentUid, env_cache
from config import get_settings
from logging_config import get_logger
from schemas import PlaceSearchResponse
from services import geocoding_service

log = get_logger("airguard.api.geocode")
router = APIRouter(prefix="/api", tags=["geocoding"])


@router.get("/geocode/search", response_model=PlaceSearchResponse)
async def search(
    uid: CurrentUid,
    q: Annotated[str, Query(min_length=2, max_length=120)],
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
) -> PlaceSearchResponse:
    """Place suggestions for a partially typed location name.

    Cached because the debounced search box re-asks for identical prefixes.
    """
    settings = get_settings()
    query = q.strip()
    key = f"geocode:search:{query.lower()}:{limit}"

    async def _load() -> list[dict]:
        return await geocoding_service.search_places(query, limit=limit)

    places = await env_cache.get_or_set(key, settings.cache_ttl_geocode_s, _load)
    return PlaceSearchResponse(places=places)


@router.get("/geocode/reverse", response_model=PlaceSearchResponse)
async def reverse(
    uid: CurrentUid,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
) -> PlaceSearchResponse:
    """Resolve coordinates into a place name, used after browser geolocation."""
    settings = get_settings()
    key = f"geocode:reverse:{lat:.3f},{lon:.3f}"

    async def _load() -> list[dict]:
        place = await geocoding_service.safe_reverse_geocode(lat, lon)
        return [place]

    places = await env_cache.get_or_set(key, settings.cache_ttl_geocode_s, _load)
    return PlaceSearchResponse(places=places)
