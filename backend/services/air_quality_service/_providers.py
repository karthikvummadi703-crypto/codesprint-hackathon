"""AQI provider fetches and history/forecast helpers."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from types import ModuleType
from typing import cast


def _svc() -> ModuleType:
    import services.air_quality_service as svc

    return svc


async def fetch_from_google(lat: float, lon: float) -> dict | None:
    svc = _svc()
    settings = svc.get_settings()
    if not settings.google_aq_api_key:
        return None
    try:
        data = await svc.request_json(
            "POST",
            "https://airquality.googleapis.com/v1/currentConditions:lookup",
            provider="google-air-quality",
            params={"key": settings.google_aq_api_key},
            json_body={
                "location": {"latitude": lat, "longitude": lon},
                "extraComputations": ["HEALTH_RECOMMENDATIONS", "LOCAL_AQI", "POLLUTANT_ADDITIONAL_INFO"],
            },
        )
    except svc.ProviderError:
        return None

    components = svc._normalize_google_components(data)
    if not components:
        return None
    index = svc._pick_google_index(data.get("indexes") or [])
    return {
        "components": components,
        "aqi": svc._opt_int((index or {}).get("aqi")),
        "status": svc._normalize_google_status((index or {}).get("category", "")),
        "dominant": str((index or {}).get("dominantPollutant", "")).lower(),
        "advisory": (data.get("healthRecommendations") or "").strip(),
        "sub": None,
    }


async def fetch_from_open_meteo(lat: float, lon: float) -> dict | None:
    svc = _svc()
    settings = svc.get_settings()
    try:
        data = await svc.request_json(
            "GET",
            f"{settings.open_meteo_air_base_url}/air-quality",
            provider="open-meteo-air",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi",
                "hourly": "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,us_aqi_carbon_monoxide,us_aqi_sulphur_dioxide",
                "timezone": "auto",
                "wind_speed_unit": "kmh",
            },
        )
    except svc.ProviderError:
        return None

    current = data.get("current") or {}
    components = {
        "pm2_5": svc._opt_float(current.get("pm2_5")),
        "pm10": svc._opt_float(current.get("pm10")),
        "no2": svc._opt_float(current.get("nitrogen_dioxide")),
        "so2": svc._opt_float(current.get("sulphur_dioxide")),
        "co": svc._opt_float(current.get("carbon_monoxide")),
        "o3": svc._opt_float(current.get("ozone")),
    }
    components = {k: v for k, v in components.items() if v is not None}
    if not components:
        return None
    return {
        "components": components,
        "aqi": svc._opt_int(current.get("us_aqi")),
        "status": "",
        "dominant": "",
        "advisory": "",
        "sub": svc._open_meteo_sub_indices(data.get("hourly") or {}, data.get("current") or {}),
    }


async def fetch_from_openweather(lat: float, lon: float) -> dict | None:
    svc = _svc()
    settings = svc.get_settings()
    if not settings.openweather_key:
        return None
    try:
        data = await svc.request_json(
            "GET",
            "https://api.openweathermap.org/data/2.5/air_pollution",
            provider="openweather",
            params={"lat": lat, "lon": lon, "appid": settings.openweather_key},
        )
    except svc.ProviderError:
        return None
    entries = data.get("list") or []
    if not entries:
        return None
    return {
        "components": entries[0].get("components") or {},
        "aqi": None,
        "status": "",
        "dominant": "",
        "advisory": "",
        "sub": None,
    }


def _open_meteo_sub_indices(hourly: dict, current: dict) -> dict | None:
    svc = _svc()
    if not hourly:
        return None
    times = hourly.get("time") or []
    now = str(current.get("time") or "")
    if now not in times:
        return None
    index = times.index(now)
    mapping = {
        "pm25": "us_aqi_pm2_5",
        "pm10": "us_aqi_pm10",
        "o3": "us_aqi_ozone",
        "no2": "us_aqi_nitrogen_dioxide",
        "so2": "us_aqi_sulphur_dioxide",
        "co": "us_aqi_carbon_monoxide",
    }
    sub: dict[str, int] = {}
    for key, field in mapping.items():
        value = svc._opt_float(svc._at(hourly, field, index))
        if value is not None:
            sub[key] = int(value)
    return sub or None


async def fetch_aqi_components(lat: float, lon: float) -> dict | None:
    svc = _svc()
    for label, fetcher in (
        ("google", svc.fetch_from_google),
        ("open-meteo", svc.fetch_from_open_meteo),
        ("openweather", svc.fetch_from_openweather),
    ):
        result = cast(dict | None, await fetcher(lat, lon))
        if result and result.get("components"):
            result["source"] = label
            return result
    return None


async def fetch_aqi_forecast(lat: float, lon: float, days: int = 5) -> list[dict] | None:
    svc = _svc()
    settings = svc.get_settings()
    days = max(1, min(int(days), 7))
    try:
        data = await svc.request_json(
            "GET",
            f"{settings.open_meteo_air_base_url}/air-quality",
            provider="open-meteo-air",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
                "timezone": "auto",
                "forecast_days": days,
                "wind_speed_unit": "kmh",
            },
        )
    except svc.ProviderError:
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    aqi_series = hourly.get("us_aqi") or []
    if not times or not aqi_series:
        return None

    points: list[dict] = []
    for index, stamp in enumerate(times):
        aqi_value = svc._opt_float(svc._at(hourly, "us_aqi", index))
        if aqi_value is None:
            continue
        components = {
            "pm2_5": svc._opt_float(svc._at(hourly, "pm2_5", index)),
            "pm10": svc._opt_float(svc._at(hourly, "pm10", index)),
            "no2": svc._opt_float(svc._at(hourly, "nitrogen_dioxide", index)),
            "so2": svc._opt_float(svc._at(hourly, "sulphur_dioxide", index)),
            "co": svc._opt_float(svc._at(hourly, "carbon_monoxide", index)),
            "o3": svc._opt_float(svc._at(hourly, "ozone", index)),
        }
        calc = svc.compute_aqi(components)
        points.append(
            {
                "timestamp": str(stamp),
                "aqi": max(1, round(aqi_value)),
                "calculatedAqi": calc["aqi"],
                "dominant": calc["dominant"],
                "pm25": round(components.get("pm2_5") or 0.0, 2),
                "pm10": round(components.get("pm10") or 0.0, 2),
                "no2": round(components.get("no2") or 0.0, 2),
                "so2": round(components.get("so2") or 0.0, 2),
                "co": round((components.get("co") or 0.0) / 1000.0, 2),
                "o3": round(components.get("o3") or 0.0, 2),
            }
        )
    return points or None


async def fetch_aqi_history(lat: float, lon: float, start_date: str, end_date: str) -> list[dict] | None:
    svc = _svc()
    settings = svc.get_settings()
    window = svc._history_window(start_date, end_date)
    if window is None:
        return None
    start, end = window
    try:
        data = await svc.request_json(
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
    except svc.ProviderError:
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return None

    buckets: dict[str, dict] = {}
    for index, stamp in enumerate(times):
        day = str(stamp)[:10]
        bucket = buckets.setdefault(day, {"aqi": [], "components": []})
        aqi_value = svc._opt_float(svc._at(hourly, "us_aqi", index))
        if aqi_value is not None:
            bucket["aqi"].append(aqi_value)
        components = {
            "pm2_5": svc._opt_float(svc._at(hourly, "pm2_5", index)),
            "pm10": svc._opt_float(svc._at(hourly, "pm10", index)),
            "no2": svc._opt_float(svc._at(hourly, "nitrogen_dioxide", index)),
            "so2": svc._opt_float(svc._at(hourly, "sulphur_dioxide", index)),
            "co": svc._opt_float(svc._at(hourly, "carbon_monoxide", index)),
            "o3": svc._opt_float(svc._at(hourly, "ozone", index)),
        }
        bucket["components"].append({k: v for k, v in components.items() if v is not None})

    rows: list[dict] = []
    for day in sorted(buckets):
        bucket = buckets[day]
        values = bucket["aqi"]
        if not values:
            continue
        mean_components = svc._mean_components(bucket["components"])
        calc = svc.compute_aqi(mean_components)
        rows.append(
            {
                "date": day,
                "aqiMean": round(sum(values) / len(values)),
                "aqiMax": round(max(values)),
                "aqiMin": round(min(values)),
                "dominant": svc.DOMINANT_LABELS.get(calc["dominant"], "PM2.5"),
                "pm25": round(mean_components.get("pm2_5") or 0.0, 1),
                "pm10": round(mean_components.get("pm10") or 0.0, 1),
            }
        )
    return rows or None


def _history_window(start_date: str, end_date: str) -> tuple[date, date] | None:
    svc = _svc()
    try:
        start = date.fromisoformat(str(start_date))
        end = date.fromisoformat(str(end_date))
    except (TypeError, ValueError):
        return None
    today = datetime.now(UTC).date()
    end = min(end, today)
    if start > end:
        return None
    if (end - start).days > svc._MAX_HISTORY_DAYS:
        start = end - timedelta(days=svc._MAX_HISTORY_DAYS)
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
