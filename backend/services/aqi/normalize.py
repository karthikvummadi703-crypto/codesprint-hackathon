from __future__ import annotations

from services.aqi.math import _f


async def _request_json(*args, **kwargs):
    from services import air_quality_service as _facade

    return await _facade.request_json(*args, **kwargs)


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
            "pm25": "pm2_5",
            "pm10": "pm10",
            "o3": "o3",
            "no2": "no2",
            "so2": "so2",
            "co": "co",
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
