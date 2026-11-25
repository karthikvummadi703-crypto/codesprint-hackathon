"""Presentation helpers for contextual air-quality and weather text."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from services.air_quality_service import aqi_category

_MEASURED = "measured"
_FORECAST = "forecast"
_MODELLED = "modelled"


def _num(value: Any) -> str:
    if value is None:
        return "unavailable"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def _relative_label(timestamp: str | None) -> str:
    """Turn a forecast timestamp into a human phrase like "in 12h".

    A raw ISO timestamp in the prompt invites the model to quote it back at the
    user verbatim, which reads as machine output rather than an outlook.
    """
    if not timestamp:
        return "later"
    try:
        moment = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return str(timestamp)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    hours = round((moment - datetime.now(UTC)).total_seconds() / 3600.0)
    if hours <= 0:
        return "now"
    if hours < 24:
        return f"in {hours}h"
    days = round(hours / 24.0)
    return f"in {days}d"


def _by_month(rows: list[dict]) -> dict[str, list[dict]]:
    """Group dated history rows by their `YYYY-MM` prefix, preserving order."""
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(str(row.get("date"))[:7], []).append(row)
    return grouped


def _compass(degrees: float) -> str:
    points = [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
    ]
    return points[int((float(degrees) % 360) / 22.5 + 0.5) % 16]


def context_timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class _SmallSections:
    aqi_forecast: list[dict]
    predictions: list[dict]
    carbon_trips: list[dict]
    rag_chunks: list[dict]

    # -- helpers -----------------------------------------------------------------

    def _normalized_forecast(self) -> list[dict]:
        """Prefer the provider forecast, fall back to the client's stored copy."""
        if self.aqi_forecast:
            rows = []
            for point in self.aqi_forecast[:6]:
                aqi = int(point.get("aqi") or 0)
                rows.append(
                    {
                        "label": point.get("label") or _relative_label(point.get("timestamp")),
                        "aqi": aqi,
                        "status": aqi_category(aqi),
                        "dominantPollutant": point.get("dominantPollutant") or point.get("dominant") or "n/a",
                        "timeOffsetHours": point.get("timeOffsetHours", 24),
                    }
                )
            return rows
        rows = []
        for point in self.predictions[:6]:
            raw_aqi = point.get("aqi")
            if raw_aqi is None:
                continue
            aqi = int(raw_aqi)
            rows.append(
                {
                    "label": point.get("label", ""),
                    "aqi": aqi,
                    "status": point.get("status") or aqi_category(aqi),
                    "dominantPollutant": point.get("dominantPollutant", "n/a"),
                    "timeOffsetHours": point.get("timeOffsetHours", 24),
                }
            )
        return rows

    def _carbon_section(self) -> str:
        if not self.carbon_trips:
            return "CARBON RECORD: no travel trips logged yet."
        total = 0.0
        by_mode: dict[str, float] = {}
        for trip in self.carbon_trips:
            if not isinstance(trip, dict):
                continue
            kg = trip.get("co2eKg")
            if not isinstance(kg, (int, float)):
                continue
            total += float(kg)
            mode = str(trip.get("mode", "Unknown"))
            by_mode[mode] = by_mode.get(mode, 0.0) + float(kg)
        breakdown = ", ".join(
            f"{mode} {kg:.1f} kg" for mode, kg in sorted(by_mode.items(), key=lambda kv: -kv[1])
        )
        return "\n".join(
            [
                f"CARBON RECORD (measured from logged trips): {len(self.carbon_trips)} trips, {total:.1f} kg CO2e total.",
                f"By mode: {breakdown}" if breakdown else "",
            ]
        ).strip()

    def _documents_section(self) -> str:
        # Excerpts are joined with single newlines on purpose. Sections are
        # delimited by a blank line, and the offline responder in `ai_service`
        # re-parses `context_text` on that delimiter, so a blank line inside a
        # section would split it and discard every excerpt.
        blocks = []
        for i, chunk in enumerate(self.rag_chunks[:4], start=1):
            source = chunk.get("fileName") or "uploaded document"
            score = chunk.get("score")
            rank = f", relevance {score}" if score else ""
            blocks.append(f"[excerpt {i} from {source}{rank}]\n{chunk.get('chunk', '')}")
        return "\n".join(
            [
                "RETRIEVED USER DOCUMENTS (quote from these; do not invent content):",
                *blocks,
            ]
        )
