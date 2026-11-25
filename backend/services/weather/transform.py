"""Open-Meteo payload transformation helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from logging_config import get_logger
from services.weather.wmo import describe_weather

log = get_logger("airguard.weather")


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
                "precipitationProbabilityMax": int(
                    _as_float(_at(daily, "precipitation_probability_max", i), 0.0)
                ),
                "windSpeedMax": _as_float(_at(daily, "wind_speed_10m_max", i)),
                "windDirectionDominant": int(_as_float(_at(daily, "wind_direction_10m_dominant", i), 0.0)),
                "uvIndexMax": _as_opt_float(_at(daily, "uv_index_max", i)),
                "sunrise": _to_utc_iso(_at(daily, "sunrise", i), tz_name)
                if _at(daily, "sunrise", i)
                else None,
                "sunset": _to_utc_iso(_at(daily, "sunset", i), tz_name) if _at(daily, "sunset", i) else None,
            }
        )
    return rows


def _at(series: dict[str, Any], field: str, index: int) -> Any:
    values = series.get(field)
    if not values or index >= len(values):
        return None
    return values[index]


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _as_opt_float(value: Any) -> float | None:
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
        except Exception as exc:
            log.warning(
                "cannot resolve timezone %r (%s); timestamps for %s stay wall-clock",
                tz_name,
                type(exc).__name__,
                tz_name,
            )
            offset = timedelta(0)
    return (naive.replace(tzinfo=UTC) - offset).isoformat().replace("+00:00", "Z")
