"""Geocoding via Nominatim (OpenStreetMap), cached and non-blocking.

Separated from the air-quality service so weather, AQI, carbon and the AI
context builder all share one geocoder and one cache instead of each issuing its
own request.
"""

from __future__ import annotations

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger

log = get_logger("airguard.geocode")


def _cache_key(kind: str, value: str) -> str:
    return f"geocode:{kind}:{value.strip().lower()}"


async def search_places(query: str, limit: int = 5) -> list[dict]:
    """Forward-geocode a free-text query into candidate places."""
    query = query.strip()
    if not query:
        return []
    settings = get_settings()
    limit = max(1, min(int(limit), 10))
    data = await request_json(
        "GET",
        f"{settings.nominatim_base_url}/search",
        provider="nominatim",
        params={"q": query, "format": "json", "limit": limit, "addressdetails": 1},
    )
    if not isinstance(data, list):
        return []
    results = []
    for item in data:
        addr = item.get("address") or {}
        fallback = (item.get("display_name") or query).split(",")[0]
        city = (
            addr.get("city")
            or addr.get("town")
            or addr.get("village")
            or addr.get("municipality")
            or addr.get("county")
            or fallback
        )
        results.append(
            {
                "name": city,
                "latitude": _to_float(item.get("lat")),
                "longitude": _to_float(item.get("lon")),
                "region": addr.get("state") or addr.get("county") or "",
                "country": addr.get("country") or "",
                "label": item.get("display_name") or city,
            }
        )
    return results


async def reverse_geocode(lat: float, lon: float) -> dict:
    """Resolve coordinates into a human-readable place name."""
    settings = get_settings()
    data = await request_json(
        "GET",
        f"{settings.nominatim_base_url}/reverse",
        provider="nominatim",
        params={"lat": lat, "lon": lon, "format": "json", "zoom": 10, "addressdetails": 1},
    )
    # Nominatim normally returns an object here, but a proxy or an error path can
    # hand back a list (or nothing at all). Tolerate both so a malformed response
    # degrades to a coordinate label instead of raising a 500.
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        data = {}

    addr = data.get("address") or {}
    display = data.get("display_name") or ""
    fallback = display.split(",")[0] if display else f"{lat:.3f}, {lon:.3f}"
    name = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or fallback
    return {
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "region": addr.get("state") or addr.get("county") or "",
        "country": addr.get("country") or "",
        "label": display or name,
    }


async def geocode_one(query: str) -> dict | None:
    """Resolve a single best match, or None when nothing was found."""
    places = await search_places(query, limit=1)
    return places[0] if places else None


async def safe_reverse_geocode(lat: float, lon: float) -> dict:
    """Reverse geocode but never raise — a geocoder outage must not blank the dashboard."""
    try:
        return await reverse_geocode(lat, lon)
    except (ProviderError, ValueError) as exc:
        log.warning("reverse geocode failed for %.3f,%.3f: %s", lat, lon, exc)
        return {
            "name": f"{lat:.3f}, {lon:.3f}",
            "latitude": lat,
            "longitude": lon,
            "region": "",
            "country": "",
            "label": f"{lat:.3f}, {lon:.3f}",
        }


def _to_float(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
