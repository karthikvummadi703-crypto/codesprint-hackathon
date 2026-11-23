"""Normalisation of raw Open-Meteo payloads into the API response shape."""

from __future__ import annotations

from services.weather_codes import describe_weather
from services.weather_constants import SOURCE
from services.weather_time import _hour_slot_index, _to_utc_iso
from services.weather_values import _as_float, _as_int, _as_opt_float, _at


def _build_current(current: dict, hourly: dict, match_index: int, tz_name: str) -> dict:
    def hourly_value(field: str, index: int = match_index) -> float | None:
        series = hourly.get(field)
        if not series or index < 0 or index >= len(series):
            return None
        return _as_float(series[index])

    observation_local = str(current.get("time") or "")
    return {
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
        "observedAt": _to_utc_iso(observation_local, tz_name),
        "precipitationProbability": _as_int(hourly_value("precipitation_probability")),
    }


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

    return {
        "current": _build_current(current, hourly, match_index, timezone_name),
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
