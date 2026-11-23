"""Air quality service assembly, location resolution, and modeled fallbacks."""

from __future__ import annotations

import math
import random
from datetime import UTC, datetime
from types import ModuleType
from typing import cast

from services import geocoding_service

_MAX_HISTORY_DAYS = 366

DEFAULT_LOCATION = {
    "name": "Gudur, Andhra Pradesh",
    "latitude": 14.1489,
    "longitude": 79.8530,
    "region": "Andhra Pradesh",
    "country": "India",
}


def _svc() -> ModuleType:
    import services.air_quality_service as svc

    return svc


async def resolve_location(
    lat: float | None = None,
    lon: float | None = None,
    city: str | None = None,
    *,
    prefer_coordinates: bool = True,
) -> tuple[dict, str]:
    svc = _svc()
    has_coords = lat is not None and lon is not None
    place: dict | None
    if has_coords and (prefer_coordinates or not city):
        lat_f = float(cast(float, lat))
        lon_f = float(cast(float, lon))
        place = await geocoding_service.safe_reverse_geocode(lat_f, lon_f)
        return (
            {
                "name": place["name"],
                "latitude": lat_f,
                "longitude": lon_f,
                "region": place.get("region", ""),
                "country": place.get("country", ""),
            },
            "coordinates",
        )

    if city:
        city = city.strip()
        if city:
            place = await geocoding_service.geocode_one(city)
            if place and place.get("latitude") is not None and place.get("longitude") is not None:
                return (
                    {
                        "name": place["name"] or city,
                        "latitude": float(place["latitude"]),
                        "longitude": float(place["longitude"]),
                        "region": place.get("region", ""),
                        "country": place.get("country", ""),
                    },
                    "geocoded",
                )

    if has_coords:
        lat_f = float(cast(float, lat))
        lon_f = float(cast(float, lon))
        return (
            {
                "name": f"{lat_f:.3f}, {lon_f:.3f}",
                "latitude": lat_f,
                "longitude": lon_f,
                "region": "",
                "country": "",
            },
            "coordinates",
        )

    return dict(svc.DEFAULT_LOCATION), "default"


async def get_air_quality(lat: float | None = None, lon: float | None = None, city: str | None = None) -> dict:
    svc = _svc()
    location, location_source = await svc.resolve_location(lat, lon, city)

    provider = await svc.fetch_aqi_components(location["latitude"], location["longitude"])
    if provider:
        components = provider["components"]
        calc = svc.compute_aqi(components)
        sub = provider.get("sub") or calc["sub"]

        aqi = provider.get("aqi")
        if aqi is None or aqi <= 0:
            aqi = calc["aqi"]
        aqi = int(max(1, min(500, aqi)))

        status = provider.get("status") or svc.aqi_category(aqi)
        if status not in {"Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Very Unhealthy", "Hazardous"}:
            status = svc.aqi_category(aqi)

        dominant_key = provider.get("dominant") or calc["dominant"]
        if dominant_key not in svc.DOMINANT_LABELS:
            dominant_key = calc["dominant"]
        dominant_label = svc.DOMINANT_LABELS[dominant_key]

        advisory = provider.get("advisory") or svc.health_advisory(aqi, dominant_label)
        source = provider["source"]
        is_estimated = False
    else:
        components = svc.build_estimated_components(location["latitude"], location["longitude"])
        calc = svc.compute_aqi(components)
        sub = calc["sub"]
        aqi = int(max(1, calc["aqi"]))
        status = svc.aqi_category(aqi)
        dominant_key = calc["dominant"]
        dominant_label = svc.DOMINANT_LABELS[dominant_key]
        advisory = svc.health_advisory(aqi, dominant_label)
        source = "estimated"
        is_estimated = True

    location = {**location, "source": location_source}

    return {
        "aqi": aqi,
        "status": status,
        "dominantPollutant": dominant_label,
        "healthAdvisory": advisory,
        "location": location,
        "pollutants": svc.pollutants_from_components(components, sub),
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "change24h": svc._estimated_change(aqi),
        "historical": svc.build_historical(aqi, components),
        "source": source,
        "isEstimated": is_estimated,
        "forecastAvailable": source != "estimated",
    }


def _estimated_change(aqi: int) -> int:
    rnd = random.Random(aqi)  # noqa: S311 - deterministic modeled estimate, not cryptographic
    return rnd.randint(-12, 15)


def build_estimated_components(lat: float, lon: float) -> dict:
    seed = int(abs(round(lat * 100) * 1000 + round(lon * 100) * 1000)) or 42
    rnd = random.Random(seed)  # noqa: S311 - deterministic modeled estimate, not cryptographic
    base = 30 + rnd.randint(0, 70)
    return {
        "pm2_5": float(base),
        "pm10": round(base * 1.6, 1),
        "no2": float(12 + rnd.randint(0, 25)),
        "so2": float(5 + rnd.randint(0, 12)),
        "co": float(rnd.randint(400, 1200)),
        "o3": float(20 + rnd.randint(0, 40)),
    }


def build_historical(aqi: int, components: dict) -> list[dict]:
    svc = _svc()
    points = []
    for i in range(12):
        hour = (i * 2) % 24
        factor = 0.82 + 0.18 * math.sin(i / 12 * math.pi)
        points.append(
            {
                "time": f"{hour:02d}:00",
                "aqi": max(20, round(aqi * factor)),
                "pm25": round(svc._f(components.get("pm2_5"), 50) * factor, 1),
                "pm10": round(svc._f(components.get("pm10"), 80) * factor, 1),
                "no2": round(svc._f(components.get("no2"), 25) * factor, 1),
                "so2": round(svc._f(components.get("so2"), 10) * factor, 1),
                "co": round(svc._f(components.get("co"), 800) / 1000 * factor, 2),
                "o3": round(svc._f(components.get("o3"), 35) * factor, 1),
            }
        )
    return points
