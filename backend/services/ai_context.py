"""Builds the structured, intent-scoped context block sent to the LLM.

Design rules:

* Only the blocks the router asked for are assembled, so a rainfall question does
  not ship the whole pollution dataset.
* Every block declares its own data provenance — measured, forecast or modelled —
  so the model can be told never to present one as another.
* Missing data is stated explicitly rather than omitted, so the assistant can say
  "I don't have that" instead of inventing a value.
"""

from __future__ import annotations

from datetime import datetime, timezone

from services import query_router as qr
from services.air_quality_service import aqi_category

_MEASURED = "measured"
_FORECAST = "forecast"
_MODELLED = "modelled"


def _num(value) -> str:
    if value is None:
        return "unavailable"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


class ContextBuilder:
    """Assembles prompt context for one question."""

    def __init__(
        self,
        *,
        location: dict | None,
        air_quality: dict | None,
        aqi_forecast: list[dict] | None,
        weather: dict | None,
        predictions: list[dict] | None,
        carbon_trips: list[dict] | None,
        history: list[dict] | None,
        rag_chunks: list[dict] | None,
    ) -> None:
        self.location = location or {}
        self.air_quality = air_quality
        self.aqi_forecast = aqi_forecast or []
        self.weather = weather
        self.predictions = predictions or []
        self.carbon_trips = carbon_trips or []
        self.history = history or []
        self.rag_chunks = rag_chunks or []

    # -- public ------------------------------------------------------------------

    def build(self, message: str) -> tuple[str, list[str], dict[str, bool]]:
        """Return (context_text, section_names, data_coverage)."""
        intent = qr.classify(message)
        blocks = set(qr.blocks_for(intent))

        sections: list[str] = []
        coverage: dict[str, bool] = {
            "air_quality": bool(self.air_quality),
            "weather": bool(self.weather),
            "aqi_forecast": bool(self.aqi_forecast or self.predictions),
            "carbon": bool(self.carbon_trips),
            "documents": bool(self.rag_chunks),
            "location": bool(self.location.get("name")),
        }

        if qr.BLOCK_LOCATION in blocks:
            section = self._location_section()
            if section:
                sections.append(section)

        if qr.BLOCK_AQI_NOW in blocks:
            section = self._aqi_now_section()
            if section:
                sections.append(section)

        if qr.BLOCK_AQI_FORECAST in blocks:
            section = self._aqi_forecast_section()
            if section:
                sections.append(section)

        if qr.BLOCK_AQI_HISTORY in blocks:
            section = self._history_section()
            if section:
                sections.append(section)

        if qr.BLOCK_WEATHER_NOW in blocks:
            section = self._weather_now_section()
            if section:
                sections.append(section)

        if qr.BLOCK_WEATHER_FORECAST in blocks:
            section = self._weather_forecast_section()
            if section:
                sections.append(section)

        if qr.BLOCK_VULNERABILITY in blocks:
            section = self._vulnerability_section()
            if section:
                sections.append(section)

        if qr.BLOCK_ACTIVITY in blocks:
            section = self._activity_section()
            if section:
                sections.append(section)

        if qr.BLOCK_CAUSE in blocks:
            section = self._cause_section()
            if section:
                sections.append(section)

        if qr.BLOCK_CARBON in blocks:
            section = self._carbon_section()
            if section:
                sections.append(section)

        if qr.BLOCK_DOCUMENTS in blocks and self.rag_chunks:
            sections.append(self._documents_section())

        if not sections:
            sections.append(
                "No live environmental data is available for the selected location right now. "
                "Say so plainly and answer from general knowledge if you can."
            )

        return "\n\n".join(sections), [s.split("\n", 1)[0] for s in sections], coverage

    # -- sections ----------------------------------------------------------------

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
        records = [
            r
            for r in self.history
            if isinstance(r, dict) and r.get("aqi") is not None
        ]
        if not records:
            return "RECENT AQI HISTORY: no stored readings for this user yet."
        ordered = sorted(records, key=lambda r: str(r.get("timestamp", "")), reverse=True)
        rows = [
            f"{str(r.get('timestamp'))[:16].replace('T', ' ')} — AQI {r.get('aqi')} "
            f"({r.get('status', 'n/a')}) at {r.get('location', 'unknown location')}"
            for r in ordered[:6]
        ]
        return "RECENT AQI HISTORY (measured, newest first):\n" + "\n".join(f"- {row}" for row in rows)

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

    def _vulnerability_section(self) -> str:
        """Meteorological + health-risk reasoning derived only from real values."""
        findings: list[str] = []
        aq = self.air_quality or {}
        aqi = aq.get("aqi")
        if isinstance(aqi, (int, float)):
            if aqi > 150:
                findings.append(
                    f"AQI {aqi} is Unhealthy or worse — everyone should cut prolonged outdoor exertion."
                )
            elif aqi > 100:
                findings.append(
                    f"AQI {aqi} is Unhealthy for Sensitive Groups — children, elderly, and people with "
                    "asthma or heart disease should limit prolonged outdoor activity."
                )
            elif aqi > 50:
                findings.append(f"AQI {aqi} is Moderate — unusually sensitive people may notice symptoms.")
            else:
                findings.append(f"AQI {aqi} is Good — normal outdoor activity for everyone.")

        current = (self.weather or {}).get("current") or {}
        wind = current.get("windSpeed")
        if isinstance(wind, (int, float)):
            if wind < 6:
                findings.append(
                    f"Wind is weak at {wind} km/h, so pollutants disperse poorly and local hotspots can persist."
                )
            elif wind > 25:
                findings.append(
                    f"Wind is strong at {wind} km/h, which usually clears pollution but can raise wind-blown dust PM10."
                )
        humidity = current.get("humidity")
        if isinstance(humidity, (int, float)):
            if humidity > 85:
                findings.append(
                    f"Humidity is {humidity}%, which favours secondary aerosol formation and haze; sticky conditions can keep pollution near the ground."
                )
            elif humidity < 30:
                findings.append(
                    f"Humidity is only {humidity}%; dry conditions raise the risk of wind-blown dust inflating PM10."
                )
        temperature = current.get("temperature")
        if isinstance(temperature, (int, float)):
            if temperature >= 32:
                findings.append(
                    f"At {temperature}°C, heat and sunlight raise photochemical ozone formation, usually peaking in early afternoon."
                )
            elif temperature <= 5:
                findings.append(
                    f"At {temperature}°C, shallow mixing layers and possible inversions can trap pollutants near the surface."
                )
        cloud = current.get("cloudCover")
        if isinstance(cloud, (int, float)) and cloud > 85:
            findings.append(
                f"Cloud cover is {cloud}%, which suppresses daytime photochemical ozone but also blocks the solar heating that helps break up inversions."
            )

        if not findings:
            return ""
        return "VULNERABILITY AND METEOROLOGY ASSESSMENT:\n" + "\n".join(f"- {f}" for f in findings)

    def _activity_section(self) -> str:
        """Rule-based outdoor guidance. Non-medical, explicitly bounded."""
        aq = self.air_quality or {}
        aqi = aq.get("aqi")
        current = (self.weather or {}).get("current") or {}
        temp = current.get("temperature")
        rain_prob = current.get("precipitationProbability")
        guidance: list[str] = []
        if isinstance(aqi, (int, float)):
            if aqi <= 50:
                guidance.append("Outdoor exercise is fine for everyone at the current AQI.")
            elif aqi <= 100:
                guidance.append(
                    "Most people can exercise normally; unusually sensitive individuals should pace themselves."
                )
            elif aqi <= 150:
                guidance.append(
                    "People with asthma, heart conditions, or who are children or elderly should shorten or move exercise indoors."
                )
            else:
                guidance.append(
                    "Move exercise indoors or postpone. An N95-style respirator helps if exposure is unavoidable."
                )
        if isinstance(temp, (int, float)) and temp >= 35:
            guidance.append(
                f"At {temp}°C, avoid the hottest part of the day, hydrate, and never leave children or pets in parked vehicles."
            )
        if isinstance(rain_prob, (int, float)) and rain_prob >= 60:
            guidance.append(
                f"Rain probability is {rain_prob}% — plan indoor alternatives and expect wet, slippery conditions."
            )
        if not guidance:
            return ""
        return (
            "OUTDOOR ACTIVITY GUIDANCE (general environmental advice, not medical advice):\n"
            + "\n".join(f"- {g}" for g in guidance)
        )

    def _cause_section(self) -> str:
        dominant = (self.air_quality or {}).get("dominantPollutant")
        if not dominant:
            return ""
        current = (self.weather or {}).get("current") or {}
        lines = [f"DOMINANT POLLUTANT: {dominant}"]
        lines.append(
            "Likely local sources: road traffic and resuspended road dust (PM), industrial and "
            "power generation (NO₂, SO₂), and photochemistry between NO₂ and volatile organics (O₃)."
        )
        wind = current.get("windSpeed")
        wind_dir = current.get("windDirection")
        if isinstance(wind, (int, float)) and isinstance(wind_dir, (int, float)):
            compass = _compass(wind_dir)
            lines.append(
                f"Current wind: {wind} km/h from {compass}. State downwind monitoring sites rather than "
                "guessing at a specific source without local sensor data."
            )
        lines.append(
            "Regional transport and crop-residue or waste burning can contribute seasonally. "
            "Do not attribute a specific source without local evidence or the user's uploaded reports."
        )
        return "\n".join(lines)

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
        breakdown = ", ".join(f"{mode} {kg:.1f} kg" for mode, kg in sorted(by_mode.items(), key=lambda kv: -kv[1]))
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
            aqi = point.get("aqi")
            if aqi is None:
                continue
            rows.append(
                {
                    "label": point.get("label", ""),
                    "aqi": int(aqi),
                    "status": point.get("status") or aqi_category(int(aqi)),
                    "dominantPollutant": point.get("dominantPollutant", "n/a"),
                    "timeOffsetHours": point.get("timeOffsetHours", 24),
                }
            )
        return rows


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
        moment = moment.replace(tzinfo=timezone.utc)
    hours = round((moment - datetime.now(timezone.utc)).total_seconds() / 3600.0)
    if hours <= 0:
        return "now"
    if hours < 24:
        return f"in {hours}h"
    days = round(hours / 24.0)
    return f"in {days}d"


def _compass(degrees: float) -> str:
    points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return points[int((float(degrees) % 360) / 22.5 + 0.5) % 16]


def context_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
