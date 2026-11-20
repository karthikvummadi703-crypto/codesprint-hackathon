from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from config import get_settings
from http_client import ProviderError
from services.aqi.breakpoints import DOMINANT_LABELS
from services.aqi.math import _opt_float, compute_aqi
from services.aqi.normalize import _at
from services.aqi.normalize import _request_json as request_json

_MAX_HISTORY_DAYS = 366


async def fetch_aqi_history(
    lat: float,
    lon: float,
    start_date: str,
    end_date: str,
) -> list[dict] | None:
    """Observed daily air quality for a past date range, from Open-Meteo.

    Uses the CAMS archive via `start_date`/`end_date`, which reaches back years.
    The forecast endpoint's `past_days` window is only ~92 days, so it cannot
    answer "how was the air last November". Each row aggregates one day of the
    provider's hourly series, so the prompt stays small and the model sees real
    observed values rather than a modelled profile.
    """
    settings = get_settings()
    window = _history_window(start_date, end_date)
    if window is None:
        return None
    start, end = window
    try:
        data = await request_json(
            "GET",
            f"{settings.open_meteo_air_base_url}/air-quality",
            provider="open-meteo-air",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
                "timezone": "auto",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
            },
        )
    except ProviderError:
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return None

    buckets: dict[str, dict] = {}
    for index, stamp in enumerate(times):
        day = str(stamp)[:10]
        bucket = buckets.setdefault(day, {"aqi": [], "components": []})
        aqi_value = _opt_float(_at(hourly, "us_aqi", index))
        if aqi_value is not None:
            bucket["aqi"].append(aqi_value)
        components = {
            "pm2_5": _opt_float(_at(hourly, "pm2_5", index)),
            "pm10": _opt_float(_at(hourly, "pm10", index)),
            "no2": _opt_float(_at(hourly, "nitrogen_dioxide", index)),
            "so2": _opt_float(_at(hourly, "sulphur_dioxide", index)),
            "co": _opt_float(_at(hourly, "carbon_monoxide", index)),
            "o3": _opt_float(_at(hourly, "ozone", index)),
        }
        bucket["components"].append({k: v for k, v in components.items() if v is not None})

    rows: list[dict] = []
    for day in sorted(buckets):
        bucket = buckets[day]
        values = bucket["aqi"]
        if not values:
            continue
        mean_components = _mean_components(bucket["components"])
        calc = compute_aqi(mean_components)
        rows.append(
            {
                "date": day,
                "aqiMean": int(round(sum(values) / len(values))),
                "aqiMax": int(round(max(values))),
                "aqiMin": int(round(min(values))),
                "dominant": DOMINANT_LABELS.get(calc["dominant"], "PM2.5"),
                "pm25": round(mean_components.get("pm2_5") or 0.0, 1),
                "pm10": round(mean_components.get("pm10") or 0.0, 1),
            }
        )
    return rows or None


def _history_window(start_date: str, end_date: str) -> tuple[date, date] | None:
    """Clamp a requested range to a sane, past-only window."""
    try:
        start = date.fromisoformat(str(start_date))
        end = date.fromisoformat(str(end_date))
    except (TypeError, ValueError):
        return None
    today = datetime.now(UTC).date()
    if end > today:
        end = today
    if start > end:
        return None
    if (end - start).days > _MAX_HISTORY_DAYS:
        start = end - timedelta(days=_MAX_HISTORY_DAYS)
    return start, end


def _mean_components(component_rows: list[dict]) -> dict:
    if not component_rows:
        return {}
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for row in component_rows:
        for key, value in row.items():
            totals[key] = totals.get(key, 0.0) + float(value)
            counts[key] = counts.get(key, 0) + 1
    return {key: totals[key] / counts[key] for key in totals if counts[key]}
