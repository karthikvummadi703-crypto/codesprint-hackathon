"""Compact weather summaries embedded in the AI context block."""

from __future__ import annotations


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
    parts = [
        f"{day['date']}: {day['condition']}, "
        f"{day['temperatureMin']}–{day['temperatureMax']}°C, "  # noqa: RUF001 - prompt text must remain byte-identical
        f"rain {day['precipitationProbabilityMax']}%"
        for day in daily
    ]
    return " | ".join(parts)
