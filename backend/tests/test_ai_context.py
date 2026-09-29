"""Query routing, grounded context assembly and the assistant system prompt.

The context builder is the guard against the model inventing numbers, so these
tests pin the two properties that matter: never present a value that was not
measured, and say so plainly when data is missing.
"""

from __future__ import annotations

from services import ai_context, ai_service, query_router as qr

LOCATION = {"name": "Gudur", "latitude": 14.1489, "longitude": 79.8530, "country": "India"}
AQI = {
    "aqi": 142,
    "status": "Unhealthy for Sensitive Groups",
    "dominantPollutant": "pm25",
    "source": "open-meteo",
    "pollutants": [{"id": "pm25", "name": "PM2.5", "value": 55.0, "unit": "µg/m³"}],
}
WEATHER = {
    "current": {
        "temperature": 31.0,
        "feelsLike": 35.0,
        "humidity": 60,
        "windSpeed": 14.0,
        "windDirection": 200,
        "cloudCover": 20,
        "condition": "Partly cloudy",
        "uvIndex": 8.0,
    },
    "daily": [
        {
            "date": "2026-01-01",
            "condition": "Clear sky",
            "temperatureMax": 30.0,
            "temperatureMin": 20.0,
            "precipitationProbabilityMax": 5,
        }
    ],
    "source": "open-meteo",
}


class TestQueryRouter:
    def test_air_quality_question(self):
        assert qr.classify("how bad is the air right now?") == "air_quality"

    def test_weather_question(self):
        assert qr.classify("what is the temperature?") == "weather"

    def test_safety_question_pulls_live_aqi(self):
        assert qr.BLOCK_AQI_NOW in qr.blocks_for(qr.classify("is it safe to go outside?"))

    def test_forecast_question_pulls_forecast_blocks(self):
        blocks = qr.blocks_for(qr.classify("what is the outlook tomorrow?"))
        assert qr.BLOCK_WEATHER_FORECAST in blocks

    def test_aqi_question_pulls_forecast_too(self):
        assert qr.BLOCK_AQI_FORECAST in qr.blocks_for(qr.classify("what is the aqi?"))

    def test_comparison_pulls_history(self):
        assert qr.BLOCK_AQI_HISTORY in qr.blocks_for(qr.classify("how has it changed since yesterday?"))

    def test_rain_question_does_not_pay_for_air_quality(self):
        """A rainfall question should not trigger an AQI call."""
        blocks = qr.blocks_for(qr.classify("will it rain tomorrow?"))
        assert qr.BLOCK_WEATHER_NOW in blocks
        assert qr.BLOCK_AQI_NOW not in blocks

    def test_mixed_question_gets_both(self):
        assert qr.classify("how does rain affect air quality pollution?") == "combined"

    def test_greeting_asks_for_no_data(self):
        assert qr.blocks_for(qr.classify("hello")) == (qr.BLOCK_LOCATION,)

    def test_carbon_question_pulls_carbon_block(self):
        assert qr.BLOCK_CARBON in qr.blocks_for(qr.classify("what is my carbon footprint?"))

    def test_document_question_wants_documents(self):
        assert qr.wants_documents(qr.classify("summarise my uploaded pdf"))

    def test_general_question_falls_back(self):
        assert qr.classify("what is an air quality index?") == "air_quality"
        assert qr.classify("tell me a joke") == "general"

    def test_edge_case_inputs_do_not_raise(self):
        for message in ("", "   ", "a" * 5000, "12345", "!!!", "AQI"):
            assert qr.classify(message)

    def test_blocks_for_unknown_intent_is_safe(self):
        assert qr.blocks_for("not-a-real-intent")

    def test_wants_location(self):
        assert qr.wants_location("air_quality")


class TestContextBuilder:
    def build(self, message: str = "how is the air?", **overrides):
        kwargs = {
            "location": LOCATION,
            "air_quality": AQI,
            "weather": WEATHER,
            "aqi_forecast": [{"timestamp": "2026-01-01T18:00:00Z", "aqi": 118, "dominantPollutant": "pm25"}],
            "predictions": [],
            "carbon_trips": [],
            "history": [],
            "rag_chunks": [],
        }
        kwargs.update(overrides)
        text, sections, coverage = ai_context.ContextBuilder(**kwargs).build(message)
        return text, sections, coverage

    def test_includes_measured_values(self):
        text, _, _ = self.build()
        assert "142" in text
        assert "Gudur" in text
        assert "PM2.5" in text

    def test_section_names_are_reported(self):
        _, sections, _ = self.build()
        assert any(s.startswith("SELECTED LOCATION") for s in sections)
        assert any(s.startswith("AIR QUALITY (now)") for s in sections)

    def test_provenance_is_marked_measured(self):
        text, _, _ = self.build()
        assert "[measured, provider: open-meteo]" in text

    def test_estimate_is_marked_and_warned_about(self):
        text, _, _ = self.build(air_quality={**AQI, "source": "estimated"})
        assert "[modelled" in text
        assert "not a measurement" in text.lower()

    def test_missing_aqi_states_unavailable(self):
        text, _, _ = self.build(air_quality=None)
        assert "unavailable" in text.lower()
        assert "no measurement" in text.lower()

    def test_missing_weather_states_unavailable(self):
        text, _, _ = self.build(message="what is the weather?", weather=None)
        assert "weather provider could not be reached" in text.lower()

    def test_coverage_reflects_absent_data(self):
        _, _, coverage = self.build(air_quality=None, weather=None)
        assert coverage["air_quality"] is False
        assert coverage["weather"] is False
        assert coverage["location"] is True

    def test_no_live_data_message_for_a_greeting(self):
        text, sections, _ = self.build(message="hello", location={}, air_quality=None, weather=None)
        assert len(sections) == 1
        assert sections[0].startswith("No live environmental data is available")
        assert "answer from general knowledge" in text

    def test_rag_chunks_are_included(self):
        text, _, _ = self.build(
            message="what does my report say?",
            rag_chunks=[{"chunk": "City target is 60 ug/m3 by 2030.", "score": 0.5}],
        )
        assert "60 ug/m3" in text
        assert "RETRIEVED USER DOCUMENTS" in text

    def test_forecast_uses_provider_provenance_when_available(self):
        text, _, _ = self.build(predictions=[{"method": "provider-forecast"}])
        assert "dispersion-model forecast" in text.lower()

    def test_forecast_fallback_is_labelled_heuristic(self):
        text, _, _ = self.build(predictions=[{"method": "heuristic"}])
        assert "heuristic prototype estimates" in text.lower()

    def test_empty_forecast_says_do_not_invent(self):
        text, _, _ = self.build(aqi_forecast=[])
        assert "do not invent" in text.lower()

    def test_history_section_orders_newest_first(self):
        history = [
            {"timestamp": "2026-01-01T10:00:00Z", "aqi": 90, "status": "Moderate", "location": "Gudur"},
            {"timestamp": "2026-01-02T10:00:00Z", "aqi": 120, "status": "Moderate", "location": "Gudur"},
        ]
        text, _, _ = self.build(message="how has it changed since yesterday?", history=history)
        assert "120" in text and "90" in text
        assert text.index("120") < text.index("90")

    def test_empty_history_is_stated(self):
        text, _, _ = self.build(message="how has it changed since yesterday?", history=[])
        assert "no stored readings" in text.lower()

    def test_vulnerability_reasoning_uses_real_numbers(self):
        text, _, _ = self.build(message="is it safe to run outside?")
        assert "142" in text
        assert "sensitive groups" in text.lower()

    def test_activity_guidance_is_bounded_as_non_medical(self):
        text, _, _ = self.build(message="can my child run outside?", air_quality={**AQI, "aqi": 180})
        assert "not medical advice" in text.lower()

    def test_missing_values_render_as_unavailable(self):
        text, _, _ = self.build(
            message="what is the weather?",
            weather={"current": {"temperature": None, "condition": "Unknown"}, "source": "open-meteo"},
        )
        assert "unavailable" in text.lower()

    def test_wrong_location_instructions_present(self):
        text, _, _ = self.build()
        assert "without changing the pinned selection" in text.lower()

    def test_compass_maps_directions(self):
        assert ai_context._compass(0) == "N"
        assert ai_context._compass(90) == "E"
        assert ai_context._compass(180) == "S"
        assert ai_context._compass(270) == "W"
        assert ai_context._compass(360) == "N"
        assert ai_context._compass(45) == "NE"


class TestSystemPrompt:
    def test_forbids_inventing_values(self):
        assert "never invent" in ai_service.SYSTEM_PROMPT.lower()

    def test_forbids_medical_diagnosis(self):
        assert "never give a medical diagnosis" in ai_service.SYSTEM_PROMPT.lower()

    def test_distinguishes_provenance(self):
        lowered = ai_service.SYSTEM_PROMPT.lower()
        assert "forecast" in lowered and "estimate" in lowered and "observation" in lowered

    def test_covers_different_location_requests(self):
        assert "different location" in ai_service.SYSTEM_PROMPT.lower()

    def test_corrects_the_rain_clears_pollution_myth(self):
        assert "rain does not reliably clear pollution" in ai_service.SYSTEM_PROMPT.lower()


class TestHistoryWindowing:
    def test_keeps_newest_turns(self):
        history = [{"role": "user", "content": f"msg {i}"} for i in range(40)]
        messages = ai_service._history_messages(history)
        assert len(messages) <= ai_service._HISTORY_TURNS
        assert messages[-1]["content"] == "msg 39"

    def test_truncates_oversized_turns(self):
        history = [{"role": "user", "content": "x" * 50_000}]
        messages = ai_service._history_messages(history)
        assert len(messages[0]["content"]) <= ai_service._MAX_TURN_CHARS + 40

    def test_empty_history_is_safe(self):
        assert ai_service._history_messages([]) == []
        assert ai_service._history_messages(None) == []
