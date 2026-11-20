from __future__ import annotations

from services import query_router as qr
from services.context.formatters import _compass
from services.context.sections import _ContextSections


class ContextBuilder(_ContextSections):
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
        household: dict | None = None,
        routines: list[dict] | None = None,
        routine_context: str | None = None,
        aqi_history: list[dict] | None = None,
        history_label: str | None = None,
    ) -> None:
        self.location = location or {}
        self.air_quality = air_quality
        self.aqi_forecast = aqi_forecast or []
        self.weather = weather
        self.predictions = predictions or []
        self.carbon_trips = carbon_trips or []
        self.history = history or []
        self.rag_chunks = rag_chunks or []
        self.aqi_history = aqi_history or []
        self.history_label = (history_label or "").strip()
        self.household = household
        self.routines = routines or []
        self.routine_context = (routine_context or "").strip()

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
            "household": bool(self.household or self.routines or self.routine_context),
            "aqi_history": bool(self.aqi_history or self.history),
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

        routine_section = self._routine_section()
        if routine_section:
            sections.append(routine_section)

        if not sections:
            sections.append(
                "No live environmental data is available for the selected location right now. "
                "Say so plainly and answer from general knowledge if you can."
            )

        return "\n\n".join(sections), [s.split("\n", 1)[0] for s in sections], coverage

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
        return "OUTDOOR ACTIVITY GUIDANCE (general environmental advice, not medical advice):\n" + "\n".join(
            f"- {g}" for g in guidance
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
