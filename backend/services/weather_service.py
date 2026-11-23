"""Weather intelligence via the Open-Meteo forecast API.

Open-Meteo is keyless, so weather works with no credentials configured. A single
upstream call returns current conditions, an hourly series and the 7-day daily
summary, which avoids three separate provider round-trips per page load.

WMO code table: https://open-meteo.com/en/docs

Normalisation, code tables, time handling and AI summaries live in focused
sibling modules; every public name is re-exported here so existing imports and
module-level monkeypatching keep working unchanged.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger
from services.weather_ai import current_weather_for_ai, forecast_summary_for_ai
from services.weather_codes import WMO_CODES, describe_weather, weather_family
from services.weather_constants import (
    _CURRENT_FIELDS,
    _DAILY_FIELDS,
    _HOURLY_FIELDS,
    SOURCE,
)
from services.weather_payload import (
    _build_current,
    _build_daily,
    _build_hourly,
    _build_weather_payload,
)
from services.weather_time import _hour_slot_index, _to_utc_iso
from services.weather_values import _as_float, _as_int, _as_opt_float, _at

log = get_logger("airguard.weather")

__all__ = [
    "SOURCE",
    "WMO_CODES",
    "_CURRENT_FIELDS",
    "_DAILY_FIELDS",
    "_HOURLY_FIELDS",
    "ProviderError",
    "_as_float",
    "_as_int",
    "_as_opt_float",
    "_at",
    "_build_current",
    "_build_daily",
    "_build_hourly",
    "_build_weather_payload",
    "_hour_slot_index",
    "_to_utc_iso",
    "current_weather_for_ai",
    "datetime",
    "describe_weather",
    "fetch_weather",
    "forecast_summary_for_ai",
    "get_settings",
    "log",
    "request_json",
    "timedelta",
    "timezone",
    "weather_family",
]


async def fetch_weather(lat: float, lon: float, forecast_days: int = 7) -> dict:
    """Fetch current + hourly + daily weather for a coordinate.

    Raises ProviderError when Open-Meteo is unreachable or answers with an
    unparseable body, so the caller can degrade independently of air quality.
    """
    settings = get_settings()
    forecast_days = max(1, min(int(forecast_days), 7))

    data = await request_json(
        "GET",
        f"{settings.open_meteo_base_url}/forecast",
        provider="open-meteo",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(_CURRENT_FIELDS),
            "hourly": ",".join(_HOURLY_FIELDS),
            "daily": ",".join(_DAILY_FIELDS),
            "timezone": "auto",
            "forecast_days": forecast_days,
            "wind_speed_unit": "kmh",
            "temperature_unit": "celsius",
            "precipitation_unit": "mm",
        },
        timeout=max(settings.http_timeout_s, 12.0),
    )
    if not isinstance(data, dict) or "current" not in data:
        raise ProviderError("open-meteo", "weather response missing 'current'", 200)

    return _build_weather_payload(data, lat, lon, forecast_days)
