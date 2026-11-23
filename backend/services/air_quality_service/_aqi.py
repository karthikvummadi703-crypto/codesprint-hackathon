"""AQI math, constants, and helpers."""

from __future__ import annotations

from types import ModuleType
from typing import Any

from logging_config import get_logger

log = get_logger("airguard.airquality")

DOMINANT_LABELS = {"pm25": "PM2.5", "pm10": "PM10", "o3": "O₃", "no2": "NO₂", "so2": "SO₂", "co": "CO"}
_PP_B_DIVISOR = {"o3": 1.96, "no2": 1.88, "so2": 2.62}
_CO_PPM_DIVISOR = 1.15

PM25_BREAKS = [(12, 50), (35.4, 100), (55.4, 150), (150.4, 200), (250.4, 300), (350.4, 400), (500.4, 500)]
PM10_BREAKS = [(54, 50), (154, 100), (254, 150), (354, 200), (424, 300), (504, 400), (604, 500)]
NO2_BREAKS = [(53, 50), (100, 100), (360, 150), (649, 200), (1249, 300), (1649, 400), (2049, 500)]
SO2_BREAKS = [(35, 50), (75, 100), (185, 150), (304, 200), (604, 300), (804, 400), (1004, 500)]
CO_BREAKS = [(4.4, 50), (9.4, 100), (12.4, 150), (15.4, 200), (30.4, 300), (40.4, 400), (50.4, 500)]
O3_BREAKS = [(54, 50), (70, 100), (85, 150), (105, 200), (200, 300), (300, 400), (400, 500)]

POLLUTANT_META = {
    "pm25": {"component": "pm2_5", "name": "PM2.5", "unit": "µg/m³", "safeLimit": 35, "description": "Fine particulate matter — penetrates deep into the lungs and dominates urban AQI."},
    "pm10": {"component": "pm10", "name": "PM10", "unit": "µg/m³", "safeLimit": 150, "description": "Coarse particles from road dust, construction and wind-blown soil."},
    "no2": {"component": "no2", "name": "NO₂", "unit": "µg/m³", "safeLimit": 100, "description": "Nitrogen dioxide from vehicle and industrial combustion."},
    "so2": {"component": "so2", "name": "SO₂", "unit": "µg/m³", "safeLimit": 80, "description": "Sulfur dioxide from fossil fuel and industrial burning."},
    "co": {"component": "co", "name": "CO", "unit": "mg/m³", "safeLimit": 10, "description": "Carbon monoxide from incomplete combustion; binds haemoglobin."},
    "o3": {"component": "o3", "name": "O₃", "unit": "µg/m³", "safeLimit": 100, "description": "Ground-level ozone formed by sunlight reactions on nitrogen oxides."},
}


def _svc() -> ModuleType:
    import services.air_quality_service as svc

    return svc


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


def _sub_index(value: float, breaks: list[tuple[float, int]]) -> int:
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
    c_low, i_low = breaks[-2]
    c_high, i_high = breaks[-1][0] * 2, breaks[-1][1] + 50
    return round(i_low + (i_high - i_low) * (value - c_low) / (c_high - c_low))


def compute_aqi(components: dict) -> dict:
    """Compute the US EPA AQI from µg/m³ concentrations."""
    svc = _svc()
    pm25 = svc._f(components.get("pm2_5"))
    pm10 = svc._f(components.get("pm10"))
    o3 = svc._f(components.get("o3"))
    no2 = svc._f(components.get("no2"))
    so2 = svc._f(components.get("so2"))
    co_mg = svc._f(components.get("co")) / 1000.0

    sub = {
        "pm25": svc._sub_index(pm25, svc.PM25_BREAKS),
        "pm10": svc._sub_index(pm10, svc.PM10_BREAKS),
        "o3": svc._sub_index(o3 / svc._PP_B_DIVISOR["o3"], svc.O3_BREAKS),
        "no2": svc._sub_index(no2 / svc._PP_B_DIVISOR["no2"], svc.NO2_BREAKS),
        "so2": svc._sub_index(so2 / svc._PP_B_DIVISOR["so2"], svc.SO2_BREAKS),
        "co": svc._sub_index(co_mg / svc._CO_PPM_DIVISOR, svc.CO_BREAKS),
    }
    dominant = max(sub, key=lambda k: sub[k])
    return {"aqi": max(sub.values()), "dominant": dominant, "sub": sub}


def pollutants_from_components(components: dict, sub: dict | None = None) -> list[dict]:
    """Build the pollutant breakdown shown in the UI."""
    svc = _svc()
    rows: list[dict] = []
    for key, meta in svc.POLLUTANT_META.items():
        raw = components.get(meta["component"])
        if raw is None:
            continue
        value = svc._f(raw)
        displayed = round(value / 1000.0, 2) if key == "co" else round(value, 2)
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
                "description": svc.POLLUTANT_META["pm25"]["description"],
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


def _normalize_google_components(data: dict) -> dict:
    svc = _svc()
    components: dict[str, float] = {}
    for pollutant in data.get("pollutants") or []:
        concentration = pollutant.get("concentration") or {}
        raw = concentration.get("value")
        if raw is None:
            continue
        value = svc._f(raw)
        units = str(concentration.get("units", "")).lower()
        if "mg/m" in units:
            value *= 1000.0
        code_map = {"pm25": "pm2_5", "pm10": "pm10", "o3": "o3", "no2": "no2", "so2": "so2", "co": "co"}
        key = str(pollutant.get("code", "")).lower()
        if key in code_map:
            components[code_map[key]] = value
    return components


def _pick_google_index(indexes: list[dict]) -> dict | None:
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


def _at(series: dict, field: str, index: int) -> Any:
    values = series.get(field)
    if not values or index >= len(values):
        return None
    return values[index]


def _f(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _opt_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _opt_int(value: Any) -> int | None:
    svc = _svc()
    parsed = svc._opt_float(value)
    return None if parsed is None else int(parsed)
