"""Weather intelligence via the Open-Meteo forecast API.

Open-Meteo is keyless, so weather works with no credentials configured. A single
upstream call returns current conditions, an hourly series and the 7-day daily
summary, which avoids three separate provider round-trips per page load.

WMO code table: https://open-meteo.com/en/docs
"""

from __future__ import annotations

from datetime import UTC as UTC
from datetime import datetime as datetime
from datetime import timedelta as timedelta
from typing import Any as Any

from config import get_settings as get_settings
from http_client import ProviderError as ProviderError
from http_client import request_json as request_json
from logging_config import get_logger
from services.weather.summary import (
    current_weather_for_ai as current_weather_for_ai,
)
from services.weather.summary import (
    forecast_summary_for_ai as forecast_summary_for_ai,
)
from services.weather.transform import (
    _as_float as _as_float,
)
from services.weather.transform import (
    _as_int as _as_int,
)
from services.weather.transform import (
    _as_opt_float as _as_opt_float,
)
from services.weather.transform import (
    _at as _at,
)
from services.weather.transform import (
    _build_daily as _build_daily,
)
from services.weather.transform import (
    _build_hourly as _build_hourly,
)
from services.weather.transform import (
    _hour_slot_index as _hour_slot_index,
)
from services.weather.transform import (
    _to_utc_iso as _to_utc_iso,
)
from services.weather.wmo import (
    WMO_CODES as WMO_CODES,
)
from services.weather.wmo import (
    describe_weather as describe_weather,
)
from services.weather.wmo import (
    weather_family as weather_family,
)

log = get_logger("airguard.weather")

SOURCE = "open-meteo"

_CURRENT_FIELDS = (
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
)
_HOURLY_FIELDS = (
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "uv_index",
    "visibility",
)
_DAILY_FIELDS = (
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "sunrise",
    "sunset",
    "uv_index_max",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_direction_10m_dominant",
)


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


def _build_weather_payload(data: dict, _lat: float, _lon: float, forecast_days: int) -> dict:
    current = data.get("current") or {}
    hourly = data.get("hourly") or {}
    daily = data.get("daily") or {}
    timezone_name = data.get("timezone") or "UTC"

    # Open-Meteo reports the observation time in the location's local timezone;
    # align it with the matching hourly slot to pick up UV, visibility and rain
    # probability, which are only published on the hourly series.
    observation_local = str(current.get("time") or "")
    hourly_times: list[str] = list(hourly.get("time") or [])
    match_index = _hour_slot_index(observation_local, hourly_times)

    def hourly_value(field: str, index: int = match_index) -> float | None:
        series = hourly.get(field)
        if not series or index < 0 or index >= len(series):
            return None
        return _as_float(series[index])

    current_payload = {
        "temperature": _as_float(current.get("temperature_2m"), 0.0),
        "feelsLike": _as_float(current.get("apparent_temperature"), 0.0),
        "humidity": int(_as_float(current.get("relative_humidity_2m"), 0.0)),
        "windSpeed": _as_float(current.get("wind_speed_10m"), 0.0),
        "windDirection": int(_as_float(current.get("wind_direction_10m"), 0.0)),
        "precipitation": _as_float(current.get("precipitation"), 0.0),
        "cloudCover": int(_as_float(current.get("cloud_cover"), 0.0)),
        "pressure": _as_float(current.get("surface_pressure"), 0.0),
        "uvIndex": _as_opt_float(hourly_value("uv_index")),
        "visibility": _as_opt_float(hourly_value("visibility")),
        "isDay": bool(int(_as_float(current.get("is_day"), 1.0))),
        "condition": describe_weather(current.get("weather_code")),
        "conditionCode": int(_as_float(current.get("weather_code"), -1)),
        "observedAt": _to_utc_iso(observation_local, timezone_name),
        "precipitationProbability": _as_int(hourly_value("precipitation_probability")),
    }

    return {
        "current": current_payload,
        "hourly": _build_hourly(hourly, timezone_name, forecast_days),
        "daily": _build_daily(daily, timezone_name),
        "units": {
            "temperature": "°C",
            "windSpeed": "km/h",
            "precipitation": "mm",
            "pressure": "hPa",
            "visibility": "m",
        },
        "source": SOURCE,
        "timezone": timezone_name,
        "forecastDays": forecast_days,
    }
