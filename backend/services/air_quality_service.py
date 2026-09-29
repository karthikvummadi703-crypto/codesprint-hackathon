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
from datetime import datetime, timezone

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger
from services import geocoding_service

log = get_logger("airguard.airquality")

DOMINANT_LABELS = {
    "pm25": "PM2.5",
    "pm10": "PM10",
    "o3": "O₃",
    "no2": "NO₂",
    "so2": "SO₂",
    "co": "CO",
}

# Molar conversion: ppb = µg/m³ x 24.45 / molecular_weight, i.e. µg/m³ / divisor.
_PP_B_DIVISOR = {"o3": 1.96, "no2": 1.88, "so2": 2.62}
# CO: mg/m³ / 1.15 -> ppm (mg/m³ = µg/m³ / 1000 first).
_CO_PPM_DIVISOR = 1.15

PM25_BREAKS = [(12, 50), (35.4, 100), (55.4, 150), (150.4, 200), (250.4, 300), (350.4, 400), (500.4, 500)]
PM10_BREAKS = [(54, 50), (154, 100), (254, 150), (354, 200), (424, 300), (504, 400), (604, 500)]
NO2_BREAKS = [(53, 50), (100, 100), (360, 150), (649, 200), (1249, 300), (1649, 400), (2049, 500)]
SO2_BREAKS = [(35, 50), (75, 100), (185, 150), (304, 200), (604, 300), (804, 400), (1004, 500)]
CO_BREAKS = [(4.4, 50), (9.4, 100), (12.4, 150), (15.4, 200), (30.4, 300), (40.4, 400), (50.4, 500)]
O3_BREAKS = [(54, 50), (70, 100), (85, 150), (105, 200), (200, 300), (300, 400), (400, 500)]

POLLUTANT_META = {
    "pm25": {
        "component": "pm2_5",
        "name": "PM2.5",
        "unit": "µg/m³",
        "safeLimit": 35,
        "description": "Fine particulate matter — penetrates deep into the lungs and dominates urban AQI.",
    },
    "pm10": {
        "component": "pm10",
        "name": "PM10",
        "unit": "µg/m³",
        "safeLimit": 150,
        "description": "Coarse particles from road dust, construction and wind-blown soil.",
    },
    "no2": {
        "component": "no2",
        "name": "NO₂",
        "unit": "µg/m³",
        "safeLimit": 100,
        "description": "Nitrogen dioxide from vehicle and industrial combustion.",
    },
    "so2": {
        "component": "so2",
        "name": "SO₂",
        "unit": "µg/m³",
        "safeLimit": 80,
        "description": "Sulfur dioxide from fossil fuel and industrial burning.",
    },
    "co": {
        "component": "co",
        "name": "CO",
        "unit": "mg/m³",
        "safeLimit": 10,
        "description": "Carbon monoxide from incomplete combustion; binds haemoglobin.",
    },
    "o3": {
        "component": "o3",
        "name": "O₃",
        "unit": "µg/m³",
        "safeLimit": 100,
        "description": "Ground-level ozone formed by sunlight reactions on nitrogen oxides.",
    },
}


def aqi_category(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


def _sub_index(value: float, breaks: list) -> int:
    """Piecewise-linear EPA sub-index over a breakpoint table."""
    c_low, i_low = 0.0, 0
    for index, (concentration, aqi_high) in enumerate(breaks):
        if value <= concentration:
            if index == 0:
                c_low, i_low = 0.0, 0
            else:
                c_low, i_low = breaks[index - 1]
            c_high, i_high = concentration, aqi_high
            span = c_high - c_low
            if span <= 0:
                return i_high
            return round(i_low + (i_high - i_low) * (value - c_low) / span)
        c_low, i_low = concentration, aqi_high
    # Above the last breakpoint: extrapolate linearly on the final segment.
    c_low, i_low = breaks[-2]
    c_high, i_high = breaks[-1][0] * 2, breaks[-1][1] + 50
    return round(i_low + (i_high - i_low) * (value - c_low) / (c_high - c_low))


def compute_aqi(components: dict) -> dict:
    """Compute the US EPA AQI from µg/m³ concentrations.

    `components` uses provider keys (`pm2_5`, `pm10`, `no2`, `so2`, `co`, `o3`)
    with CO in µg/m³, matching OpenWeather and Open-Meteo output directly.
    """
    pm25 = _f(components.get("pm2_5"))
    pm10 = _f(components.get("pm10"))
    o3 = _f(components.get("o3"))
    no2 = _f(components.get("no2"))
    so2 = _f(components.get("so2"))
    co_mg = _f(components.get("co")) / 1000.0

    sub = {
        "pm25": _sub_index(pm25, PM25_BREAKS),
        "pm10": _sub_index(pm10, PM10_BREAKS),
        "o3": _sub_index(o3 / _PP_B_DIVISOR["o3"], O3_BREAKS),
        "no2": _sub_index(no2 / _PP_B_DIVISOR["no2"], NO2_BREAKS),
        "so2": _sub_index(so2 / _PP_B_DIVISOR["so2"], SO2_BREAKS),
        "co": _sub_index(co_mg / _CO_PPM_DIVISOR, CO_BREAKS),
    }
    dominant = max(sub, key=sub.get)
    return {"aqi": max(sub.values()), "dominant": dominant, "sub": sub}


def pollutants_from_components(components: dict, sub: dict | None = None) -> list[dict]:
    """Build the pollutant breakdown shown in the UI.

    `status` is a Good/High flag against the WHO/EPA reference concentration,
    not an AQI band, because each pollutant is compared on its own scale.
    """
    rows: list[dict] = []
    for key, meta in POLLUTANT_META.items():
        raw = components.get(meta["component"])
        if raw is None:
            continue
        value = _f(raw)
        if key == "co":
            displayed = round(value / 1000.0, 2)
        else:
            displayed = round(value, 2)
        rows.append(
            {
                "id": key,
                "name": meta["name"],
                "value": displayed,
                "unit": meta["unit"],
                "status": "Good" if displayed <= meta["safeLimit"] else "High",
                "description": meta["description"],
                "safeLimit": meta["safeLimit"],
                "subIndex": (sub or {}).get(key),
            }
        )
    if not rows:
        rows.append(
            {
                "id": "pm25",
                "name": "PM2.5",
                "value": 0.0,
                "unit": "µg/m³",
                "status": "Good",
                "description": POLLUTANT_META["pm25"]["description"],
                "safeLimit": 35,
                "subIndex": None,
            }
        )
    return rows


def health_advisory(aqi: int, dominant_label: str) -> str:
    """US EPA public-health advisory text, with the dominant pollutant named."""
    if aqi <= 50:
        return f"Air quality is satisfactory and poses little or no risk. {dominant_label} is the main pollutant at present."
    if aqi <= 100:
        return f"Air quality is acceptable, though unusually sensitive people may react to {dominant_label}."
    if aqi <= 150:
        return f"Sensitive groups should reduce prolonged or heavy outdoor exertion. {dominant_label} is elevated."
    if aqi <= 200:
        return f"Everyone may begin to experience health effects as {dominant_label} rises. Sensitive groups should avoid heavy exertion outdoors."
    if aqi <= 300:
        return f"Health alert: {dominant_label} is driving unhealthy conditions for everyone. Avoid prolonged outdoor exertion."
    return f"Emergency conditions: {dominant_label} is at hazardous levels. Avoid all outdoor activity."


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
    if has_coords and (prefer_coordinates or not city):
        place = await geocoding_service.safe_reverse_geocode(float(lat), float(lon))
        return (
            {
                "name": place["name"],
                "latitude": float(lat),
                "longitude": float(lon),
                "region": place.get("region", ""),
                "country": place.get("country", ""),
            },
            "coordinates",
        )

    if city:
        city = city.strip()
        if city:
            place = await geocoding_service.geocode_one(city)
            if place and place.get("latitude") is not None:
                return (
                    {
                        "name": place["name"] or city,
                        "latitude": place["latitude"],
                        "longitude": place["longitude"],
                        "region": place.get("region", ""),
                        "country": place.get("country", ""),
                    },
                    "geocoded",
                )

    if has_coords:
        return (
            {
                "name": f"{lat:.3f}, {lon:.3f}",
                "latitude": float(lat),
                "longitude": float(lon),
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
            "Good", "Moderate", "Unhealthy for Sensitive Groups",
            "Unhealthy", "Very Unhealthy", "Hazardous",
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
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
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
    rnd = random.Random(aqi)
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


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def _normalize_google_components(data: dict) -> dict:
    components: dict[str, float] = {}
    for pollutant in data.get("pollutants") or []:
        concentration = pollutant.get("concentration") or {}
        raw = concentration.get("value")
        if raw is None:
            continue
        value = _f(raw)
        units = str(concentration.get("units", "")).lower()
        if "mg/m" in units:
            value *= 1000.0
        code_map = {
            "pm25": "pm2_5", "pm10": "pm10", "o3": "o3",
            "no2": "no2", "so2": "so2", "co": "co",
        }
        key = str(pollutant.get("code", "")).lower()
        if key in code_map:
            components[code_map[key]] = value
    return components


def _pick_google_index(indexes: list) -> dict | None:
    for index in indexes:
        if str(index.get("code", "")).lower() == "usa_epa":
            return index
    return indexes[0] if indexes else None


def _normalize_google_status(category: str) -> str:
    mapping = {
        "good": "Good",
        "moderate": "Moderate",
        "unhealthy for sensitive groups": "Unhealthy for Sensitive Groups",
        "unhealthy": "Unhealthy",
        "very unhealthy": "Very Unhealthy",
        "hazardous": "Hazardous",
    }
    return mapping.get(str(category).lower(), "")


def _at(series: dict, field: str, index: int):
    values = series.get(field)
    if not values or index >= len(values):
        return None
    return values[index]


def _f(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _opt_float(value) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _opt_int(value) -> int | None:
    parsed = _opt_float(value)
    return None if parsed is None else int(parsed)
