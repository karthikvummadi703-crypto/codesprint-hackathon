"""Air quality and AQI forecast routes."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.deps import CurrentUid, coordinates, env_cache
from cache import coord_key
from config import get_settings
from logging_config import get_logger
from schemas import AirQualityResponse, PredictionsResponse
from services import air_quality_service

log = get_logger("airguard.api.air")
router = APIRouter(prefix="/api", tags=["air quality"])

# Horizons offered by the forecast UI, in hours from now.
FORECAST_OFFSETS = [0, 3, 6, 12, 24]
_LABELS = {0: "Now", 3: "+3 hours", 6: "+6 hours", 12: "+12 hours", 24: "+24 hours"}
_CONFIDENCE = {0: 100, 3: 94, 6: 88, 12: 81, 24: 73}

# A provider point further away than this from the requested horizon is treated as
# missing rather than silently substituted, so a sparse series cannot masquerade
# as a forecast at the wrong time.
_MAX_POINT_GAP_S = 5400


@router.get("/aqi", response_model=AirQualityResponse)
async def get_aqi(
    uid: CurrentUid,
    where: Annotated[dict, Depends(coordinates)],
) -> AirQualityResponse:
    """Current air quality for the requested location.

    Cached per ~1.1 km coordinate bucket for the configured TTL. The cache only
    avoids re-billing the upstream provider; each caller still gets a response for
    the location it asked about.
    """
    settings = get_settings()
    lat, lon, city = where["lat"], where["lon"], where["city"]

    if lat is not None and lon is not None:
        bucket = coord_key(lat, lon)
        key = f"aqi:{bucket}"

        async def _load() -> dict:
            return await air_quality_service.get_air_quality(lat=lat, lon=lon)

        payload = await env_cache.get_or_set(key, settings.cache_ttl_aqi_s, _load)
    else:
        payload = await air_quality_service.get_air_quality(city=city)

    return AirQualityResponse(**payload)


@router.get("/predictions", response_model=PredictionsResponse)
async def get_predictions(
    uid: CurrentUid,
    where: Annotated[dict, Depends(coordinates)],
    days: Annotated[int, Query(ge=1, le=7)] = 5,
) -> PredictionsResponse:
    """AQI outlook for the requested location.

    Prefers a genuine dispersion-model forecast from the air-quality provider. If
    no provider is reachable it falls back to the original heuristic estimate and
    labels the response `heuristic-prototype`, so the UI discloses the difference
    instead of presenting a guess as a forecast.
    """
    settings = get_settings()
    location, _ = await air_quality_service.resolve_location(
        where["lat"], where["lon"], where["city"]
    )
    bucket = coord_key(location["latitude"], location["longitude"])
    # Namespaced: `api/ai.py` caches a *list* of daily forecast rows under an
    # otherwise identical key. Sharing it made this route receive a list and raise
    # `PredictionsResponse() argument after ** must be a mapping` on a 500.
    key = f"predictions:{bucket}:{days}"

    async def _load() -> dict:
        return await _build_predictions(location["latitude"], location["longitude"], location, days)

    payload = await env_cache.get_or_set(key, settings.cache_ttl_aqi_s, _load)
    result = PredictionsResponse(**payload)
    log.info(
        "predictions location=%s method=%s horizon=%dh",
        result.location.name,
        result.method,
        result.horizonHours,
    )
    return result


async def _build_predictions(lat: float, lon: float, location: dict, days: int) -> dict:
    provider_points = await air_quality_service.fetch_aqi_forecast(lat, lon, days=days)
    now = datetime.now(timezone.utc)

    if provider_points:
        forecasts = _from_provider(provider_points, now)
        if forecasts:
            return {
                "predictions": forecasts,
                "location": location,
                "source": "open-meteo-air",
                "method": "provider-forecast",
                "horizonHours": FORECAST_OFFSETS[-1],
                "note": (
                    "Atmospheric dispersion-model output (CAMS), not observed readings. "
                    "Confidence declines with lead time."
                ),
                "timestamp": now.isoformat().replace("+00:00", "Z"),
            }

    current = await air_quality_service.get_air_quality(lat=lat, lon=lon)
    return {
        "predictions": _heuristic_forecast(int(current["aqi"]), current["pollutants"], now),
        "location": location,
        "source": "heuristic",
        "method": "heuristic-prototype",
        "horizonHours": FORECAST_OFFSETS[-1],
        "note": (
            "No forecasting provider was reachable, so these values are a diurnal-scaling "
            "prototype estimate derived from the current reading. They are not a validated "
            "model and must not be presented as a real forecast."
        ),
        "timestamp": now.isoformat().replace("+00:00", "Z"),
    }


def _from_provider(points: list[dict], now: datetime) -> list[dict]:
    forecasts = []
    for offset in FORECAST_OFFSETS:
        point = _nearest_hour(points, offset, now)
        if point is None:
            continue
        aqi = int(max(1, point["aqi"]))
        forecasts.append(
            {
                "timeOffsetHours": offset,
                "label": _LABELS.get(offset, f"+{offset}h"),
                "timestamp": (now + timedelta(hours=offset)).isoformat().replace("+00:00", "Z"),
                "aqi": aqi,
                "confidence": _CONFIDENCE.get(offset, 70),
                "pm25": point["pm25"],
                "pm10": point["pm10"],
                "no2": point["no2"],
                "so2": point["so2"],
                "co": point["co"],
                "o3": point["o3"],
                "dominantPollutant": air_quality_service.DOMINANT_LABELS.get(
                    point["dominant"], "PM2.5"
                ),
                "status": air_quality_service.aqi_category(aqi),
            }
        )
    return forecasts


def _heuristic_forecast(aqi: int, pollutants: list, now: datetime) -> list[dict]:
    """Original prototype scaling, retained as the offline fallback."""
    rnd = random.Random(aqi)
    factors = [1.0, 1.08, 1.18, 1.1, 0.93]
    factors = [max(0.7, base + rnd.uniform(-0.05, 0.05)) for base in factors]

    def scaled(pollutant_id: str, factor: float) -> float:
        for pollutant in pollutants:
            if pollutant["id"] == pollutant_id:
                return round(float(pollutant["value"]) * factor, 2)
        return round(50 * factor, 2)

    forecasts = []
    for offset, factor in zip(FORECAST_OFFSETS, factors):
        value = max(15, round(aqi * factor))
        # Dominant pollutant is recomputed from the scaled concentrations, so it
        # tracks whichever pollutant actually drives the reading.
        components = {
            "pm2_5": scaled("pm25", factor),
            "pm10": scaled("pm10", factor),
            "no2": scaled("no2", factor),
            "so2": scaled("so2", factor),
            "co": scaled("co", factor) * 1000.0,
            "o3": scaled("o3", factor),
        }
        dominant = air_quality_service.compute_aqi(components)["dominant"]
        forecasts.append(
            {
                "timeOffsetHours": offset,
                "label": _LABELS.get(offset, f"+{offset}h"),
                "timestamp": (now + timedelta(hours=offset)).isoformat().replace("+00:00", "Z"),
                "aqi": value,
                "confidence": _CONFIDENCE.get(offset, 70),
                "pm25": scaled("pm25", factor),
                "pm10": scaled("pm10", factor),
                "no2": scaled("no2", factor),
                "so2": scaled("so2", factor),
                "co": scaled("co", factor),
                "o3": scaled("o3", factor),
                "dominantPollutant": air_quality_service.DOMINANT_LABELS.get(dominant, "PM2.5"),
                "status": air_quality_service.aqi_category(value),
            }
        )
    return forecasts


def _nearest_hour(points: list[dict], offset: int, now: datetime) -> dict | None:
    target = now + timedelta(hours=offset)
    best: dict | None = None
    best_gap: float | None = None
    for point in points:
        try:
            stamp = datetime.fromisoformat(str(point["timestamp"]))
        except (ValueError, TypeError):
            continue
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        gap = abs((stamp - target).total_seconds())
        if best_gap is None or gap < best_gap:
            best, best_gap = point, gap
    if best is None or best_gap is None or best_gap > _MAX_POINT_GAP_S:
        return None
    return best
