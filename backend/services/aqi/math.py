"""Numeric helpers and breakpoint calculations for AQI values."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from services.aqi.breakpoints import (
    _CO_PPM_DIVISOR,
    _PP_B_DIVISOR,
    CO_BREAKS,
    NO2_BREAKS,
    O3_BREAKS,
    PM10_BREAKS,
    PM25_BREAKS,
    POLLUTANT_META,
    SO2_BREAKS,
)


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


def _sub_index(value: float, breaks: Sequence[tuple[float, int]]) -> int:
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
    dominant = max(sub, key=lambda key: sub[key])
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
        displayed = round(value / 1000.0, 2) if key == "co" else round(value, 2)
        rows.append(
            {
                "id": key,
                "name": meta["name"],
                "value": displayed,
                "unit": meta["unit"],
                "status": "Good" if displayed <= _f(meta["safeLimit"]) else "High",
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
    parsed = _opt_float(value)
    return None if parsed is None else int(parsed)
