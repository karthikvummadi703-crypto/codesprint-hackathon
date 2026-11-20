from __future__ import annotations

from config import get_settings
from http_client import ProviderError
from services.aqi.math import _opt_float, _opt_int, compute_aqi
from services.aqi.normalize import (
    _at,
    _normalize_google_components,
    _normalize_google_status,
    _pick_google_index,
)
from services.aqi.normalize import (
    _request_json as request_json,
)

# --------------------------------------------------------------------------------------
# Providers
# --------------------------------------------------------------------------------------


async def fetch_from_google(lat: float, lon: float) -> dict | None:
    settings = get_settings()
    if not settings.google_aq_api_key:
        return None
    try:
        data = await request_json(
            "POST",
            "https://airquality.googleapis.com/v1/currentConditions:lookup",
            provider="google-air-quality",
            params={"key": settings.google_aq_api_key},
            json_body={
                "location": {"latitude": lat, "longitude": lon},
                "extraComputations": ["HEALTH_RECOMMENDATIONS", "LOCAL_AQI", "POLLUTANT_ADDITIONAL_INFO"],
            },
        )
    except ProviderError:
        return None

    components = _normalize_google_components(data)
    if not components:
        return None
    index = _pick_google_index(data.get("indexes") or [])
    return {
        "components": components,
        "aqi": _opt_int((index or {}).get("aqi")),
        "status": _normalize_google_status((index or {}).get("category", "")),
        "dominant": str((index or {}).get("dominantPollutant", "")).lower(),
        "advisory": (data.get("healthRecommendations") or "").strip(),
        "sub": None,
    }


async def fetch_from_open_meteo(lat: float, lon: float) -> dict | None:
    """Fetch CAMS-based air quality plus EPA indices from Open-Meteo (keyless).

    Both the current block and the hourly series are requested in one call: the
    hourly series is what carries the per-pollutant EPA sub-indices.
    """
    settings = get_settings()
    try:
        data = await request_json(
            "GET",
            f"{settings.open_meteo_air_base_url}/air-quality",
            provider="open-meteo-air",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi",
                "hourly": ",".join(
                    (
                        "us_aqi",
                        "us_aqi_pm2_5",
                        "us_aqi_pm10",
                        "us_aqi_ozone",
                        "us_aqi_nitrogen_dioxide",
                        "us_aqi_carbon_monoxide",
                        "us_aqi_sulphur_dioxide",
                    )
                ),
                "timezone": "auto",
                "wind_speed_unit": "kmh",
            },
        )
    except ProviderError:
        return None

    current = data.get("current") or {}
    components = {
        "pm2_5": _opt_float(current.get("pm2_5")),
        "pm10": _opt_float(current.get("pm10")),
        "no2": _opt_float(current.get("nitrogen_dioxide")),
        "so2": _opt_float(current.get("sulphur_dioxide")),
        "co": _opt_float(current.get("carbon_monoxide")),
        "o3": _opt_float(current.get("ozone")),
    }
    components = {k: v for k, v in components.items() if v is not None}
    if not components:
        return None
    return {
        "components": components,
        # Open-Meteo publishes us_aqi alongside per-pollutant sub-indices, so the
        # reported number is the provider's own EPA value rather than a recompute.
        "aqi": _opt_int(current.get("us_aqi")),
        "status": "",
        "dominant": "",
        "advisory": "",
        "sub": _open_meteo_sub_indices(data.get("hourly") or {}, data.get("current") or {}),
    }


async def fetch_from_openweather(lat: float, lon: float) -> dict | None:
    settings = get_settings()
    if not settings.openweather_key:
        return None
    try:
        data = await request_json(
            "GET",
            "https://api.openweathermap.org/data/2.5/air_pollution",
            provider="openweather",
            params={"lat": lat, "lon": lon, "appid": settings.openweather_key},
        )
    except ProviderError:
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
    """Prefer the provider's own per-pollutant EPA sub-indices when published."""
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
        value = _opt_float(_at(hourly, field, index))
        if value is not None:
            sub[key] = int(value)
    return sub or None


async def fetch_aqi_components(lat: float, lon: float) -> dict | None:
    """Run the provider chain and return the first usable result."""
    for label, fetcher in (
        ("google", fetch_from_google),
        ("open-meteo", fetch_from_open_meteo),
        ("openweather", fetch_from_openweather),
    ):
        result = await fetcher(lat, lon)
        if result and result.get("components"):
            result["source"] = label
            return result
    return None


async def fetch_aqi_forecast(lat: float, lon: float, days: int = 5) -> list[dict] | None:
    """Fetch a genuine AQI forecast (CAMS dispersion output) from Open-Meteo.

    Returns hourly points carrying the provider's EPA AQI plus each pollutant's
    concentration, or None when no forecasting provider is reachable.
    """
    settings = get_settings()
    days = max(1, min(int(days), 7))
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
                "forecast_days": days,
                "wind_speed_unit": "kmh",
            },
        )
    except ProviderError:
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    aqi_series = hourly.get("us_aqi") or []
    if not times or not aqi_series:
        return None

    points: list[dict] = []
    for index, stamp in enumerate(times):
        aqi_value = _opt_float(_at(hourly, "us_aqi", index))
        if aqi_value is None:
            continue
        components = {
            "pm2_5": _opt_float(_at(hourly, "pm2_5", index)),
            "pm10": _opt_float(_at(hourly, "pm10", index)),
            "no2": _opt_float(_at(hourly, "nitrogen_dioxide", index)),
            "so2": _opt_float(_at(hourly, "sulphur_dioxide", index)),
            "co": _opt_float(_at(hourly, "carbon_monoxide", index)),
            "o3": _opt_float(_at(hourly, "ozone", index)),
        }
        calc = compute_aqi(components)
        points.append(
            {
                "timestamp": str(stamp),
                "aqi": max(1, int(round(aqi_value))),
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
