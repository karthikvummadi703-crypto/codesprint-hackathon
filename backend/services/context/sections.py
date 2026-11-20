from __future__ import annotations

from services.air_quality_service import aqi_category
from services.context.formatters import (
    _FORECAST,
    _MEASURED,
    _MODELLED,
    _by_month,
    _num,
    _SmallSections,
)


class _ContextSections(_SmallSections):
    household: dict | None
    routines: list[dict]
    routine_context: str
    location: dict
    air_quality: dict | None
    aqi_history: list[dict]
    history: list[dict]
    history_label: str
    weather: dict | None

    # -- sections ----------------------------------------------------------------

    def _routine_section(self) -> str:
        """Household and daily-routine guidance supplied by the user's own plan.

        This is user-provided context, not an environmental measurement. It is
        included on every turn so routine questions are answered against the same
        plan shown in the app rather than from generic advice alone.
        """
        if not (self.household or self.routines or self.routine_context):
            return ""
        lines = ["HOUSEHOLD & DAILY ROUTINE PLAN [user-provided, not measured]:"]
        if self.routine_context:
            lines.append(self.routine_context)
        if self.household and not self.routine_context:
            members = self.household.get("members") or []
            if members:
                lines.append(
                    "Members: "
                    + ", ".join(
                        f"{m.get('name', 'unnamed')} ({m.get('kind', 'adult')})" for m in members[:12]
                    )
                )
        if self.routines and not self.routine_context:
            for routine in self.routines[:30]:
                title = routine.get("title")
                if title:
                    lines.append(
                        f"- {title} [{routine.get('category', 'routine')}, {routine.get('priority', 'medium')}]: "
                        f"{routine.get('detail', '')} Impact: {routine.get('impact', '')}"
                    )
        lines.append(
            "Use this plan when suggesting routines. State the direct impact of each choice "
            "and never present the plan as measured air-quality data."
        )
        return "\n".join(lines)

    def _location_section(self) -> str:
        name = self.location.get("name")
        if not name:
            return ""
        parts = [f"SELECTED LOCATION: {name}"]
        lat, lon = self.location.get("latitude"), self.location.get("longitude")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            parts.append(f"({lat:.4f}, {lon:.4f})")
        region = ", ".join(p for p in (self.location.get("region"), self.location.get("country")) if p)
        if region and region not in name:
            parts.append(f"region: {region}")
        parts.append(
            "This is the location pinned on the user's dashboard. Use it unless the user "
            "explicitly asks about a different place; if they do, answer for that place "
            "without changing the pinned selection."
        )
        return "\n".join(parts)

    def _aqi_now_section(self) -> str:
        aq = self.air_quality
        if not aq:
            return "AIR QUALITY (now): unavailable — no measurement could be retrieved for the selected location."

        source = aq.get("source", "unknown")
        provenance = _MEASURED if source != "estimated" else _MODELLED
        lines = [
            f"AIR QUALITY (now) [{provenance}, provider: {source}]: "
            f"AQI {aq.get('aqi')} — {aq.get('status')}, dominant pollutant {aq.get('dominantPollutant')}"
        ]
        pollutants = aq.get("pollutants") or []
        if pollutants:
            compact = ", ".join(
                f"{p.get('name')} {_num(p.get('value'))} {p.get('unit')}" for p in pollutants[:6]
            )
            lines.append(f"Measured concentrations: {compact}")
        advisory = aq.get("healthAdvisory")
        if advisory:
            lines.append(f"Official advisory: {advisory}")
        if provenance == _MODELLED:
            lines.append(
                "NOTE: this value is a deterministic estimate, not a measurement. "
                "Do not present it as an observed reading."
            )
        if aq.get("timestamp"):
            lines.append(f"Observation time: {aq.get('timestamp')}")
        return "\n".join(lines)

    def _aqi_forecast_section(self) -> str:
        points = self._normalized_forecast()
        if not points:
            return (
                "AIR QUALITY (forecast): unavailable — no forecasting source could be reached. "
                "Do not invent a forecast."
            )
        window = points[:6]
        compact = "; ".join(
            f"{p['label']} → AQI {p['aqi']} ({p['status']}), {p.get('dominantPollutant', 'n/a')}"
            for p in window
        )
        values = [p["aqi"] for p in points]
        peak = max(values)
        direction = "rising" if values[-1] > values[0] else ("falling" if values[-1] < values[0] else "flat")
        horizon = points[-1].get("timeOffsetHours", 24)
        method = self.predictions[0].get("method") if self.predictions else None
        provenance = _FORECAST if method == "provider-forecast" else _MODELLED
        note = (
            "These are dispersion-model forecast values, not measurements. State the horizon "
            "and the uncertainty."
            if provenance == _FORECAST
            else "These are heuristic prototype estimates, not a validated model. Always disclose that."
        )
        return "\n".join(
            [
                f"AIR QUALITY (forecast) [{provenance}]: {compact}",
                f"Window summary: peak AQI {peak} within {horizon}h, trend {direction}.",
                note,
            ]
        )

    def _history_section(self) -> str:
        parts: list[str] = []
        if self.aqi_history:
            parts.append(self._observed_history_section())

        records = [r for r in self.history if isinstance(r, dict) and r.get("aqi") is not None]
        if records:
            ordered = sorted(records, key=lambda r: str(r.get("timestamp", "")), reverse=True)
            rows = [
                f"{str(r.get('timestamp'))[:16].replace('T', ' ')} — AQI {r.get('aqi')} "
                f"({r.get('status', 'n/a')}) at {r.get('location', 'unknown location')}"
                for r in ordered[:6]
            ]
            parts.append(
                "RECENT AQI READINGS (measured, newest first):\n" + "\n".join(f"- {row}" for row in rows)
            )

        if not parts:
            return "RECENT AQI HISTORY: no stored readings for this user yet."
        # Joined with a single newline on purpose: sections are delimited by a blank
        # line, and `ai_service` re-parses on that delimiter.
        return "\n".join(parts)

    def _observed_history_section(self) -> str:
        """Provider-backed observed history for a requested past period.

        Rows arrive as daily aggregates from the air-quality provider's reanalysis
        archive. A long range is rolled up per month so the prompt stays compact
        while still covering every month the user asked about.
        """
        rows = [r for r in self.aqi_history if isinstance(r, dict) and r.get("date")]
        if not rows:
            return ""
        rows = sorted(rows, key=lambda r: str(r.get("date")))
        label = self.history_label or "the requested period"
        lines = [f"HISTORICAL AIR QUALITY [measured reanalysis, provider: open-meteo] for {label}:"]
        if len(rows) <= 45:
            for r in rows:
                mean = r.get("aqiMean")
                status = aqi_category(int(mean)) if isinstance(mean, (int, float)) else "n/a"
                lines.append(
                    f"- {r.get('date')}: AQI avg {_num(mean)} ({status}), "
                    f"max {_num(r.get('aqiMax'))}, dominant {r.get('dominant', 'n/a')}"
                )
        else:
            for month, group in _by_month(rows).items():
                means = [float(g["aqiMean"]) for g in group if isinstance(g.get("aqiMean"), (int, float))]
                peaks = [float(g["aqiMax"]) for g in group if isinstance(g.get("aqiMax"), (int, float))]
                if not means:
                    continue
                avg = round(sum(means) / len(means))
                lines.append(
                    f"- {month}: avg AQI {avg} ({aqi_category(avg)}), "
                    f"peak {int(max(peaks)) if peaks else 'n/a'} over {len(means)} days"
                )
        values = [int(r["aqiMean"]) for r in rows if isinstance(r.get("aqiMean"), (int, float))]
        if values:
            lines.append(
                f"Period summary: average AQI {round(sum(values) / len(values))}, "
                f"peak {max(values)}, lowest {min(values)} across {len(values)} days."
            )
        lines.append(
            "These are observed/reanalysis values for the period above, not a forecast. "
            "Do not extrapolate beyond it."
        )
        return "\n".join(lines)

    def _weather_now_section(self) -> str:
        payload = self.weather
        if not payload:
            return "WEATHER (now): unavailable — the weather provider could not be reached."
        current = payload.get("current") or {}
        if not current:
            return "WEATHER (now): unavailable — the provider returned no current conditions."
        bits = [
            f"temperature {_num(current.get('temperature'))}°C (feels {_num(current.get('feelsLike'))}°C)",
            f"condition {current.get('condition')}",
            f"humidity {_num(current.get('humidity'))}%",
            f"wind {_num(current.get('windSpeed'))} km/h from {_num(current.get('windDirection'))}°",
            f"cloud cover {_num(current.get('cloudCover'))}%",
            f"precipitation {_num(current.get('precipitation'))} mm",
            f"pressure {_num(current.get('pressure'))} hPa",
        ]
        if current.get("uvIndex") is not None:
            bits.append(f"UV index {_num(current.get('uvIndex'))}")
        if current.get("visibility") is not None:
            bits.append(f"visibility {_num(current.get('visibility'))} m")
        if current.get("precipitationProbability") is not None:
            bits.append(f"rain probability {_num(current.get('precipitationProbability'))}%")
        return "\n".join(
            [
                "WEATHER (now) [measured]: " + ", ".join(bits),
                f"Observed at: {current.get('observedAt', 'unknown')}. Source: {payload.get('source', 'n/a')}.",
            ]
        )

    def _weather_forecast_section(self) -> str:
        payload = self.weather
        daily = (payload or {}).get("daily") or []
        if not daily:
            return (
                "WEATHER (forecast): unavailable — no forecast could be retrieved. "
                "Do not invent weather values."
            )
        rows = [
            f"{d.get('date')}: {d.get('condition')}, {d.get('temperatureMin')}–{d.get('temperatureMax')}°C, "
            f"rain probability {d.get('precipitationProbabilityMax')}%, "
            f"precipitation {d.get('precipitationSum')} mm, wind up to {d.get('windSpeedMax')} km/h"
            for d in daily[:7]
        ]
        return "\n".join(
            [
                "WEATHER (forecast) [measured forecast model, not observations]:",
                *[f"- {row}" for row in rows],
            ]
        )
