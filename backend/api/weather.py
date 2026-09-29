"""Weather routes.

Weather is fetched once per location on the backend and cached, so the dashboard
and the AI assistant share a single upstream call and a single set of numbers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.deps import CurrentUid, coordinates, env_cache
from cache import coord_key
from config import get_settings
from logging_config import get_logger
from schemas import WeatherResponse
from services import air_quality_service, weather_service

log = get_logger("airguard.api.weather")
router = APIRouter(prefix="/api", tags=["weather"])


@router.get("/weather", response_model=WeatherResponse)
async def get_weather(
    uid: CurrentUid,
    where: Annotated[dict, Depends(coordinates)],
    days: Annotated[int, Query(ge=1, le=7, description="Days of daily forecast")] = 7,
    hours: Annotated[int, Query(ge=6, le=168, description="Hours of hourly forecast")] = 48,
) -> WeatherResponse:
    """Current conditions, an hourly series and a daily outlook for one location."""
    settings = get_settings()
    lat, lon, city = where["lat"], where["lon"], where["city"]

    if lat is not None and lon is not None:
        location, _ = await air_quality_service.resolve_location(lat, lon, None)
        bucket = coord_key(lat, lon)
    else:
        location, _ = await air_quality_service.resolve_location(None, None, city)
        bucket = coord_key(location["latitude"], location["longitude"])

    # Namespaced: the summary route and the AI context builder cache the same
    # provider call for the same coordinates. A shared key would hand this route's
    # `location` field and truncated hourly series to those callers.
    key = f"weather-full:{bucket}:{days}:{hours}"

    async def _load() -> dict:
        payload = await weather_service.fetch_weather(
            location["latitude"], location["longitude"], forecast_days=days
        )
        payload["location"] = location
        return payload

    cached = await env_cache.get_or_set(key, settings.cache_ttl_weather_s, _load)
    # Copy before editing. The cache entry is shared, so truncating `hourly` in
    # place would permanently shorten the series every later caller sees, and
    # a smaller `hours` request would poison a larger one for the whole TTL.
    payload = {**cached, "hourly": list(cached.get("hourly", []))[:hours]}
    payload["timestamp"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return WeatherResponse(**payload)


@router.get("/weather/summary", tags=["weather"])
async def get_weather_summary(
    uid: CurrentUid,
    where: Annotated[dict, Depends(coordinates)],
    days: Annotated[int, Query(ge=1, le=7)] = 3,
) -> dict:
    """Condensed weather context.

    Used by the AI context builder to enrich a conversation with live conditions
    without shipping the full hourly and daily arrays into the prompt.
    """
    settings = get_settings()
    lat, lon, city = where["lat"], where["lon"], where["city"]

    if lat is not None and lon is not None:
        location, _ = await air_quality_service.resolve_location(lat, lon, None)
        bucket = coord_key(lat, lon)
    else:
        location, _ = await air_quality_service.resolve_location(None, None, city)
        bucket = coord_key(location["latitude"], location["longitude"])

    key = f"weather-summary:{bucket}:{days}:48"

    async def _load() -> dict:
        return await weather_service.fetch_weather(
            location["latitude"], location["longitude"], forecast_days=days
        )

    payload = await env_cache.get_or_set(key, settings.cache_ttl_weather_s, _load)
    current = payload.get("current") or {}
    return {
        "location": location,
        "current": current,
        "daily": (payload.get("daily") or [])[:days],
        "source": payload.get("source", weather_service.SOURCE),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
