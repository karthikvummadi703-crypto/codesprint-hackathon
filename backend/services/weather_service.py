"""Weather intelligence via the Open-Meteo forecast API.

Open-Meteo is keyless, so weather works with no credentials configured. A single
upstream call returns current conditions, an hourly series and the 7-day daily
summary, which avoids three separate provider round-trips per page load.

WMO code table: https://open-meteo.com/en/docs
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger

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

WMO_CODES: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
}

# Categories used by the UI to pick an icon and accent colour.
def weather_family(code: int) -> str:
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "partly-cloudy"
    if code == 3:
        return "overcast"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55, 56, 57):
        return "drizzle"
    if 61 <= code <= 67:
        return "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if 80 <= code <= 82:
        return "showers"
    return "thunderstorm"


def describe_weather(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return WMO_CODES.get(int(code), "Unknown")


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


def _hour_slot_index(observation_local: str, hourly_times: list[str]) -> int:
    """Index of the hourly slot that contains the observation.

    `current.time` is published at 15-minute resolution while the hourly series
    is on the hour, so an exact-match lookup fails for three quarters of all
    requests and silently drops UV index, visibility and rain probability from
    "current conditions". The observation is therefore matched to the hourly slot
    it falls inside, and only to a later slot if no earlier one contains it.
    """
    if not observation_local or not hourly_times:
        return -1
    if observation_local in hourly_times:
        return hourly_times.index(observation_local)

    try:
        observed = datetime.fromisoformat(observation_local).replace(minute=0, second=0, microsecond=0)
    except ValueError:
        return -1

    for index, stamp in enumerate(hourly_times):
        try:
            slot = datetime.fromisoformat(stamp)
        except ValueError:
            continue
        if slot == observed:
            return index
        if slot > observed:
            # First slot after the observation: nothing earlier covered it.
            return index
    return -1


def _build_weather_payload(data: dict, lat: float, lon: float, forecast_days: int) -> dict:
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


def _build_hourly(hourly: dict, tz_name: str, forecast_days: int) -> list[dict]:
    times = list(hourly.get("time") or [])
    if not times:
        return []
    keep = min(len(times), forecast_days * 24)
    rows: list[dict] = []
    for i in range(keep):
        code = _as_float(_at(hourly, "weather_code", i), -1)
        rows.append(
            {
                "timestamp": _to_utc_iso(times[i], tz_name),
                "localTime": times[i],
                "temperature": _as_float(_at(hourly, "temperature_2m", i)),
                "apparentTemperature": _as_float(_at(hourly, "apparent_temperature", i)),
                "humidity": int(_as_float(_at(hourly, "relative_humidity_2m", i), 0.0)),
                "precipitation": _as_float(_at(hourly, "precipitation", i)),
                "precipitationProbability": int(_as_float(_at(hourly, "precipitation_probability", i), 0.0)),
                "windSpeed": _as_float(_at(hourly, "wind_speed_10m", i)),
                "windDirection": int(_as_float(_at(hourly, "wind_direction_10m", i), 0.0)),
                "cloudCover": int(_as_float(_at(hourly, "cloud_cover", i), 0.0)),
                "uvIndex": _as_opt_float(_at(hourly, "uv_index", i)),
                "condition": describe_weather(int(code)) if code >= 0 else "Unknown",
                "conditionCode": int(code),
            }
        )
    return rows


def _build_daily(daily: dict, tz_name: str) -> list[dict]:
    times = list(daily.get("time") or [])
    rows: list[dict] = []
    for i, day in enumerate(times):
        code = _as_float(_at(daily, "weather_code", i), -1)
        rows.append(
            {
                "date": day,
                "condition": describe_weather(int(code)) if code >= 0 else "Unknown",
                "conditionCode": int(code),
                "temperatureMax": _as_float(_at(daily, "temperature_2m_max", i)),
                "temperatureMin": _as_float(_at(daily, "temperature_2m_min", i)),
                "precipitationSum": _as_float(_at(daily, "precipitation_sum", i)),
                "precipitationProbabilityMax": int(_as_float(_at(daily, "precipitation_probability_max", i), 0.0)),
                "windSpeedMax": _as_float(_at(daily, "wind_speed_10m_max", i)),
                "windDirectionDominant": int(_as_float(_at(daily, "wind_direction_10m_dominant", i), 0.0)),
                "uvIndexMax": _as_opt_float(_at(daily, "uv_index_max", i)),
                "sunrise": _to_utc_iso(_at(daily, "sunrise", i), tz_name) if _at(daily, "sunrise", i) else None,
                "sunset": _to_utc_iso(_at(daily, "sunset", i), tz_name) if _at(daily, "sunset", i) else None,
            }
        )
    return rows


def current_weather_for_ai(payload: dict, location_name: str) -> str:
    """One-line current-conditions summary used inside the AI context block."""
    current = (payload or {}).get("current") or {}
    if not current:
        return ""
    bits = [
        f"{current.get('temperature')}°C",
        f"feels {current.get('feelsLike')}°C",
        current.get("condition"),
        f"humidity {current.get('humidity')}%",
        f"wind {current.get('windSpeed')} km/h",
    ]
    if current.get("precipitation"):
        bits.append(f"precip {current.get('precipitation')} mm")
    if current.get("uvIndex") is not None:
        bits.append(f"UV {round(float(current['uvIndex']), 1)}")
    return f"{location_name}: " + ", ".join(str(b) for b in bits if b not in (None, ""))


def forecast_summary_for_ai(payload: dict, days: int = 3) -> str:
    """Compact multi-day outlook for the AI context block."""
    daily = ((payload or {}).get("daily") or [])[:days]
    if not daily:
        return ""
    parts = []
    for day in daily:
        parts.append(
            f"{day['date']}: {day['condition']}, "
            f"{day['temperatureMin']}–{day['temperatureMax']}°C, "
            f"rain {day['precipitationProbabilityMax']}%"
        )
    return " | ".join(parts)


def _at(series: dict, field: str, index: int):
    values = series.get(field)
    if not values or index >= len(values):
        return None
    return values[index]


def _as_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _as_opt_float(value) -> float | None:
    """Like `_as_float` but preserves "not reported" as None instead of 0.0.

    Used for fields the schema marks optional: reporting UV index 0 or visibility
    0 when the provider omitted them would render as a real reading.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_utc_iso(local_naive: str, tz_name: str) -> str:
    """Convert Open-Meteo's location-local timestamp into a UTC ISO string.

    `timezone=auto` makes the API return wall-clock time without an offset, so the
    location's zone is resolved and applied here. The stored value is a real
    instant, which is what every other module expects.

    A zone that cannot be resolved is logged rather than passed over in silence:
    silently keeping the wall-clock time would publish timestamps that are wrong
    by the UTC offset, which is worse than an obviously unconverted value.
    """
    if not local_naive:
        return ""
    try:
        naive = datetime.fromisoformat(local_naive)
    except ValueError:
        return local_naive

    offset = timedelta(0)
    if tz_name and tz_name.upper() != "UTC":
        try:
            from zoneinfo import ZoneInfo

            offset = naive.replace(tzinfo=ZoneInfo(tz_name)).utcoffset() or timedelta(0)
        except Exception as exc:  # noqa: BLE001 - degrade, but say so
            log.warning(
                "cannot resolve timezone %r (%s); timestamps for %s stay wall-clock",
                tz_name,
                type(exc).__name__,
                tz_name,
            )
            offset = timedelta(0)
    return (naive.replace(tzinfo=timezone.utc) - offset).isoformat().replace("+00:00", "Z")
