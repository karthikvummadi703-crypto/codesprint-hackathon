"""The offline assistant reply.

This path is what users see whenever the LLM is rate-limited or unreachable, so
it is not a cosmetic detail: it is the only answer in the product. It must quote
the real context, name the real place, and never emit a bare timestamp or an
"Outlook: ." with nothing after it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from services import ai_context, ai_service

NOW = datetime.now(timezone.utc)


def build_context(question: str = "", **overrides):
    """Build the context the way the route does, for the actual question.

    `ContextBuilder.build` only assembles the blocks the router asked for, so an
    empty message yields the "general" intent and no weather section at all.
    """
    kwargs = {
        "location": {"name": "Hyderabad", "latitude": 17.38, "longitude": 78.49, "country": "India"},
        "air_quality": {
            "aqi": 80,
            "status": "Moderate",
            "dominantPollutant": "PM2.5",
            "source": "open-meteo",
            "pollutants": [{"id": "pm25", "name": "PM2.5", "value": 42.0, "unit": "µg/m³"}],
        },
        "aqi_forecast": [
            {"timestamp": (NOW + timedelta(hours=hours)).isoformat().replace("+00:00", "Z"), "aqi": aqi, "dominant": "pm25"}
            for hours, aqi in ((3, 75), (12, 118), (30, 140))
        ],
        "weather": {
            "current": {
                "temperature": 32.9,
                "feelsLike": 35.0,
                "humidity": 72,
                "windSpeed": 14.0,
                "windDirection": 200,
                "cloudCover": 20,
                "precipitation": 0.0,
                "pressure": 1010.0,
                "uvIndex": 8.0,
                "condition": "Light drizzle",
                "observedAt": "2026-09-28T09:45:00Z",
            },
            "daily": [
                {
                    "date": "2026-09-29",
                    "condition": "Clear sky",
                    "temperatureMax": 31.0,
                    "temperatureMin": 22.0,
                    "precipitationProbabilityMax": 10,
                    "precipitationSum": 0.0,
                    "windSpeedMax": 12.0,
                }
            ],
            "source": "open-meteo",
        },
        "predictions": [{"method": "provider-forecast"}],
        "carbon_trips": [],
        "history": [],
        "rag_chunks": [],
    }
    kwargs.update(overrides)
    text, _, _ = ai_context.ContextBuilder(**kwargs).build(question)
    return text


def answer(question: str, **overrides) -> str:
    return ai_service.fallback_response(question, build_context(question, **overrides))


class TestSectionExtraction:
    def test_reads_aqi_out_of_an_inline_header(self):
        """The AQI line is data-on-the-same-line as the label.

        A section reader that only returns lines *below* the header would yield
        an empty string here, and the assistant would claim it has no reading
        while the dashboard shows one.
        """
        context = build_context()
        assert ai_service._aqi_from_context(context) == 80

    def test_includes_the_provenance_tag_as_data(self):
        """`[measured, provider: open-meteo]` must not leak into the answer."""
        reply = answer("how is the air right now?")
        assert "open-meteo]" not in reply
        assert "provider:" not in reply

    def test_returns_the_full_weather_line(self):
        weather = ai_service._section(build_context("what is the weather?"), "WEATHER (NOW)")
        assert "32.9" in weather
        assert "Light drizzle" in weather

    def test_missing_section_is_empty(self):
        assert ai_service._section(build_context(), "NOT A SECTION") == ""

    def test_forecast_section_is_readable(self):
        forecast = ai_service._section(build_context(), "AIR QUALITY (FORECAST)")
        assert "AQI" in forecast


class TestGroundedAnswers:
    def test_air_quality_answer_quotes_the_reading(self):
        reply = answer("how is the air right now?")
        assert "80" in reply
        assert "Hyderabad" in reply

    def test_forecast_labels_are_relative_not_iso(self):
        """A raw ISO timestamp reads as machine output in a chat reply."""
        reply = answer("what is the outlook tomorrow?")
        assert "T09:45" not in reply and "in 3h" in reply

    def test_weather_answer_names_the_place(self):
        reply = answer("what is the weather like?")
        assert "Hyderabad" in reply
        assert "32.9" in reply

    def test_weather_answer_has_no_empty_outlook(self):
        reply = answer("what is the weather like?")
        assert "Outlook: ." not in reply

    def test_forecast_only_weather_answers_are_populated(self):
        reply = answer("will it rain tomorrow?", weather={"daily": [
            {"date": "2026-09-30", "condition": "Heavy rain", "temperatureMax": 26.0, "temperatureMin": 20.0,
             "precipitationProbabilityMax": 90, "precipitationSum": 12.0, "windSpeedMax": 20.0}], "source": "open-meteo"})
        assert "Heavy rain" in reply
        assert "Outlook: ." not in reply

    def test_cause_answer_names_the_pollutant(self):
        reply = answer("why is it so polluted?")
        assert "PM2.5" in reply

    def test_greeting_identifies_the_place(self):
        assert "Hyderabad" in answer("hello")

    def test_every_answer_declares_degradation(self):
        for question in (
            "how is the air right now?",
            "what is the weather like?",
            "is it safe to run outside?",
            "what is my carbon footprint?",
        ):
            assert "unavailable" in answer(question).lower(), question


class TestSafetyBand:
    @pytest.mark.parametrize(
        "aqi,expected",
        [(25, "good"), (80, "moderate"), (130, "sensitive groups"), (180, "unhealthy for everyone")],
    )
    def test_guidance_matches_the_band(self, aqi, expected):
        context = build_context(air_quality={
            "aqi": aqi, "status": "x", "dominantPollutant": "PM2.5", "source": "open-meteo", "pollutants": [],
        })
        reply = ai_service.fallback_response("is it safe to run outside?", context)
        assert expected in reply.lower()
        assert str(aqi) in reply

    def test_missing_aqi_refuses_to_advise(self):
        reply = answer("is it safe to run outside?", air_quality=None)
        assert "don't have a current aqi" in reply.lower()
        # It must not invent a number to fill the gap.
        assert "aqi is" not in reply.lower()


class TestHonestyWhenDataIsMissing:
    def test_no_weather_does_not_guess(self):
        reply = answer("what is the temperature right now?", weather=None)
        assert "could not retrieve weather" in reply.lower()

    def test_no_aqi_does_not_guess(self):
        reply = answer("how is the air right now?", air_quality=None, aqi_forecast=[])
        assert "no aqi measurement" in reply.lower()

    def test_estimated_data_is_not_presented_as_observed(self):
        context = build_context(air_quality={
            "aqi": 60, "status": "Moderate", "dominantPollutant": "PM2.5",
            "source": "estimated", "pollutants": [],
        })
        reply = ai_service.fallback_response("how is the air right now?", context)
        assert "modelled" in reply.lower() or "estimated" in reply.lower()

    def test_no_carbon_data_says_so(self):
        assert "no travel trips" in answer("what is my carbon footprint?").lower()

    def test_empty_context_does_not_crash(self):
        empty = ai_context.ContextBuilder(
            location={}, air_quality=None, aqi_forecast=None, weather=None,
            predictions=[], carbon_trips=[], history=[], rag_chunks=[],
        ).build("how is the air?")[0]
        for question in ("how is the air?", "what is the weather?", "why?", "compare", "summarise my report"):
            assert isinstance(ai_service.fallback_response(question, empty), str)
