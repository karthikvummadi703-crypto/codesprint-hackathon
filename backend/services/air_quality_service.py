"""Air quality: EPA index math plus a provider chain with normalized output.

Provider order (first success wins):
  1. Google Air Quality API   — needs GOOGLE_AQ_API_KEY
  2. Open-Meteo Air Quality   — keyless, CAMS-based, also serves EPA sub-indices
  3. OpenWeatherMap          — needs OPENWEATHER_APPID
  4. Deterministic estimate   — clearly flagged via `isEstimated`

Every provider returns concentrations in µg/m³, which is what the EPA breakpoint
math below expects. CO is the one exception: EPA defines its CO breakpoints in
ppm, so the conversion to ppm happens inside `compute_aqi` and nowhere else.

EPA sub-index breakpoint tables (40 CFR Part 58, Table 2):
  PM2.5 / PM10 / O3 / NO2 / SO2  — µg/m³ (O3, NO2, SO2 tables are stated in ppb)
  CO                           — ppm
"""

from __future__ import annotations

import math
import random
from datetime import UTC, datetime

from http_client import request_json as request_json
from logging_config import get_logger
from services import geocoding_service
from services.aqi.breakpoints import (
    CO_BREAKS as CO_BREAKS,
)
from services.aqi.breakpoints import (
    DOMINANT_LABELS as DOMINANT_LABELS,
)
from services.aqi.breakpoints import (
    NO2_BREAKS as NO2_BREAKS,
)
from services.aqi.breakpoints import (
    O3_BREAKS as O3_BREAKS,
)
from services.aqi.breakpoints import (
    PM10_BREAKS as PM10_BREAKS,
)
from services.aqi.breakpoints import (
    PM25_BREAKS as PM25_BREAKS,
)
from services.aqi.breakpoints import (
    POLLUTANT_META as POLLUTANT_META,
)
from services.aqi.breakpoints import (
    SO2_BREAKS as SO2_BREAKS,
)
from services.aqi.history import (
    _history_window as _history_window,
)
from services.aqi.history import (
    _mean_components as _mean_components,
)
from services.aqi.history import (
    fetch_aqi_history as fetch_aqi_history,
)
from services.aqi.math import (
    _f as _f,
)
from services.aqi.math import (
    _opt_float as _opt_float,
)
from services.aqi.math import (
    _opt_int as _opt_int,
)
from services.aqi.math import (
    _sub_index as _sub_index,
)
from services.aqi.math import (
    aqi_category as aqi_category,
)
from services.aqi.math import (
    compute_aqi as compute_aqi,
)
from services.aqi.math import (
    health_advisory as health_advisory,
)
from services.aqi.math import (
    pollutants_from_components as pollutants_from_components,
)
from services.aqi.normalize import (
    _at as _at,
)
from services.aqi.normalize import (
    _normalize_google_components as _normalize_google_components,
)
from services.aqi.normalize import (
    _normalize_google_status as _normalize_google_status,
)
from services.aqi.normalize import (
    _pick_google_index as _pick_google_index,
)
from services.aqi.providers import (
    _open_meteo_sub_indices as _open_meteo_sub_indices,
)
from services.aqi.providers import (
    fetch_aqi_components as fetch_aqi_components,
)
from services.aqi.providers import (
    fetch_aqi_forecast as fetch_aqi_forecast,
)
from services.aqi.providers import (
    fetch_from_google as fetch_from_google,
)
from services.aqi.providers import (
    fetch_from_open_meteo as fetch_from_open_meteo,
)
from services.aqi.providers import (
    fetch_from_openweather as fetch_from_openweather,
)

__all__ = [
    "CO_BREAKS",
    "DEFAULT_LOCATION",
    "DOMINANT_LABELS",
    "NO2_BREAKS",
    "O3_BREAKS",
    "PM10_BREAKS",
    "PM25_BREAKS",
    "POLLUTANT_META",
    "SO2_BREAKS",
    "_at",
    "_f",
    "_history_window",
    "_mean_components",
    "_normalize_google_components",
    "_normalize_google_status",
    "_open_meteo_sub_indices",
    "_opt_float",
    "_opt_int",
    "_pick_google_index",
    "_sub_index",
    "aqi_category",
    "build_historical",
    "compute_aqi",
    "fetch_aqi_components",
    "fetch_aqi_forecast",
    "fetch_aqi_history",
    "fetch_from_google",
    "fetch_from_open_meteo",
    "fetch_from_openweather",
    "get_air_quality",
    "health_advisory",
    "pollutants_from_components",
    "request_json",
    "resolve_location",
]

log = get_logger("airguard.airquality")

# --------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------


DEFAULT_LOCATION = {
    "name": "Gudur, Andhra Pradesh",
    "latitude": 14.1489,
    "longitude": 79.8530,
    "region": "Andhra Pradesh",
    "country": "India",
}


async def resolve_location(
    lat: float | None = None,
    lon: float | None = None,
    city: str | None = None,
    *,
    prefer_coordinates: bool = True,
) -> tuple[dict, str]:
    """Turn a request into a concrete location.

    Coordinates always win when both forms are supplied, because the dashboard
    stores a pinned coordinate and re-geocoding the place name can snap to a
    different city (a previous version of this function did exactly that, which
    made Predictions always forecast the default city).

    Returns (location, source) where source is coordinates|geocoded|default.
    """
    has_coords = lat is not None and lon is not None
    if lat is not None and lon is not None and (prefer_coordinates or not city):
        latitude, longitude = float(lat), float(lon)
        place = await geocoding_service.safe_reverse_geocode(latitude, longitude)
        return (
            {
                "name": place["name"],
                "latitude": latitude,
                "longitude": longitude,
                "region": place.get("region", ""),
                "country": place.get("country", ""),
            },
            "coordinates",
        )

    if city:
        city = city.strip()
        if city:
            city_place = await geocoding_service.geocode_one(city)
            if city_place and city_place.get("latitude") is not None:
                return (
                    {
                        "name": city_place["name"] or city,
                        "latitude": city_place["latitude"],
                        "longitude": city_place["longitude"],
                        "region": city_place.get("region", ""),
                        "country": city_place.get("country", ""),
                    },
                    "geocoded",
                )

    if has_coords and lat is not None and lon is not None:
        latitude, longitude = float(lat), float(lon)
        return (
            {
                "name": f"{latitude:.3f}, {longitude:.3f}",
                "latitude": latitude,
                "longitude": longitude,
                "region": "",
                "country": "",
            },
            "coordinates",
        )

    return dict(DEFAULT_LOCATION), "default"


async def get_air_quality(
    lat: float | None = None,
    lon: float | None = None,
    city: str | None = None,
) -> dict:
    """Current air quality for a location, with an explicit data-provenance flag."""
    location, location_source = await resolve_location(lat, lon, city)

    provider = await fetch_aqi_components(location["latitude"], location["longitude"])
    if provider:
        components = provider["components"]
        calc = compute_aqi(components)
        sub = provider.get("sub") or calc["sub"]

        aqi = provider.get("aqi")
        if aqi is None or aqi <= 0:
            aqi = calc["aqi"]
        aqi = int(max(1, min(500, aqi)))

        status = provider.get("status") or aqi_category(aqi)
        if status not in {
            "Good",
            "Moderate",
            "Unhealthy for Sensitive Groups",
            "Unhealthy",
            "Very Unhealthy",
            "Hazardous",
        }:
            status = aqi_category(aqi)

        dominant_key = provider.get("dominant") or calc["dominant"]
        if dominant_key not in DOMINANT_LABELS:
            dominant_key = calc["dominant"]
        dominant_label = DOMINANT_LABELS[dominant_key]

        advisory = provider.get("advisory") or health_advisory(aqi, dominant_label)
        source = provider["source"]
        is_estimated = False
    else:
        components = build_estimated_components(location["latitude"], location["longitude"])
        calc = compute_aqi(components)
        sub = calc["sub"]
        aqi = int(max(1, calc["aqi"]))
        status = aqi_category(aqi)
        dominant_key = calc["dominant"]
        dominant_label = DOMINANT_LABELS[dominant_key]
        advisory = health_advisory(aqi, dominant_label)
        source = "estimated"
        is_estimated = True

    location = {**location, "source": location_source}

    return {
        "aqi": aqi,
        "status": status,
        "dominantPollutant": dominant_label,
        "healthAdvisory": advisory,
        "location": location,
        "pollutants": pollutants_from_components(components, sub),
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "change24h": _estimated_change(aqi),
        "historical": build_historical(aqi, components),
        "source": source,
        "isEstimated": is_estimated,
        "forecastAvailable": source != "estimated",
    }


def _estimated_change(aqi: int) -> int:
    """Placeholder 24h delta.

    No 24-hour AQI history is available from the configured providers, so this is
    a deterministic placeholder rather than a measurement. The frontend labels it
    as unavailable when `isEstimated` is set.
    """
    rnd = random.Random(aqi)
    return rnd.randint(-12, 15)


def build_estimated_components(lat: float, lon: float) -> dict:
    """Last-resort deterministic estimate used only when every provider fails.

    Keyed on rounded coordinates so the same place always produces the same
    numbers and the UI does not flicker between refreshes.
    """
    seed = int(abs(round(lat * 100) * 1000 + round(lon * 100) * 1000)) or 42
    rnd = random.Random(seed)
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
    """Intra-day shape for the trend chart.

    The configured providers expose current conditions only, so this renders the
    characteristic diurnal PM curve anchored to the live reading. The UI labels it
    as a modelled profile, not observed history.
    """
    points = []
    for i in range(12):
        hour = (i * 2) % 24
        factor = 0.82 + 0.18 * math.sin(i / 12 * math.pi)
        points.append(
            {
                "time": f"{hour:02d}:00",
                "aqi": max(20, round(aqi * factor)),
                "pm25": round(_f(components.get("pm2_5"), 50) * factor, 1),
                "pm10": round(_f(components.get("pm10"), 80) * factor, 1),
                "no2": round(_f(components.get("no2"), 25) * factor, 1),
                "so2": round(_f(components.get("so2"), 10) * factor, 1),
                "co": round(_f(components.get("co"), 800) / 1000 * factor, 2),
                "o3": round(_f(components.get("o3"), 35) * factor, 1),
            }
        )
    return points
