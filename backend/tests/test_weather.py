"""Weather aggregation, forecast alignment and provenance.

Tests target `_build_weather_payload` directly so they run without network access
while still covering the real normalisation logic.
"""

from __future__ import annotations

from datetime import datetime

import pytest

from services import weather_service as ws

HOURLY = {
    "time": ["2026-01-01T00:00", "2026-01-01T01:00", "2026-01-01T02:00"],
    "temperature_2m": [18.0, 17.5, 17.0],
    "apparent_temperature": [18.0, 17.4, 16.9],
    "relative_humidity_2m": [70, 72, 74],
    "precipitation_probability": [10, 20, 30],
    "precipitation": [0.0, 0.0, 0.4],
    "weather_code": [0, 1, 61],
    "cloud_cover": [0, 10, 90],
    "wind_speed_10m": [8.0, 9.0, 10.0],
    "wind_direction_10m": [180, 190, 200],
    "uv_index": [0.0, 0.0, 1.0],
    "visibility": [24000.0, 24000.0, 20000.0],
}
DAILY = {
    "time": ["2026-01-01", "2026-01-02"],
    "weather_code": [61, 95],
    "temperature_2m_max": [19.0, 20.0],
    "temperature_2m_min": [16.0, 17.0],
    "precipitation_sum": [0.4, 2.0],
    "precipitation_probability_max": [30, 80],
    "uv_index_max": [3.0, 4.0],
    "wind_speed_10m_max": [14.0, 18.0],
    "wind_direction_10m_dominant": [180, 200],
    "sunrise": ["2026-01-01T06:30", "2026-01-02T06:30"],
    "sunset": ["2026-01-01T18:00", "2026-01-02T18:00"],
}
CURRENT = {
    "time": "2026-01-01T01:00",
    "temperature_2m": 17.5,
    "relative_humidity_2m": 72,
    "apparent_temperature": 17.4,
    "is_day": 0,
    "precipitation": 0.0,
    "weather_code": 1,
    "cloud_cover": 10,
    "surface_pressure": 1012.0,
    "wind_speed_10m": 9.0,
    "wind_direction_10m": 190,
}


def sample(tz: str = "Asia/Kolkata") -> dict:
    return {
        "latitude": 17.38,
        "longitude": 78.49,
        "timezone": tz,
        "current": dict(CURRENT),
        "hourly": {k: list(v) for k, v in HOURLY.items()},
        "daily": {k: list(v) for k, v in DAILY.items()},
    }


def build(tz: str = "Asia/Kolkata", days: int = 7) -> dict:
    return ws._build_weather_payload(sample(tz), 17.38, 78.49, days)


class TestWmoCodes:
    def test_known_codes_have_descriptions(self):
        assert "clear" in ws.describe_weather(0).lower()
        assert "rain" in ws.describe_weather(61).lower()
        assert "thunder" in ws.describe_weather(95).lower()

    def test_none_and_unknown_are_safe(self):
        assert ws.describe_weather(None) == "Unknown"
        assert ws.describe_weather(9999) == "Unknown"

    def test_families_cover_the_whole_table(self):
        for code in ws.WMO_CODES:
            assert ws.weather_family(code)

    def test_precipitation_codes_are_rain_family(self):
        assert ws.weather_family(61) == "rain"
        assert ws.weather_family(95) == "thunderstorm"
        assert ws.weather_family(0) == "clear"


class TestCurrent:
    def test_normalised_fields(self):
        current = build()["current"]
        assert current["temperature"] == 17.5
        assert current["feelsLike"] == 17.4
        assert current["humidity"] == 72
        assert current["windSpeed"] == 9.0
        assert current["condition"] == "Mainly clear"
        assert current["isDay"] is False

    def test_picks_up_hourly_only_fields(self):
        """UV and visibility exist only on the hourly series, matched by timestamp."""
        current = build()["current"]
        assert current["uvIndex"] == 0.0
        assert current["visibility"] == 24000.0
        assert current["precipitationProbability"] == 20

    def test_observation_time_is_converted_to_utc(self):
        """01:00 in Asia/Kolkata is 19:30 UTC the previous day."""
        observed = build()["current"]["observedAt"]
        parsed = datetime.fromisoformat(observed.replace("Z", "+00:00"))
        assert parsed.hour == 19
        assert parsed.day == 31  # 2025-12-31

    def test_utc_timezone_is_left_alone(self):
        observed = build(tz="UTC")["current"]["observedAt"]
        assert observed.startswith("2026-01-01T01:00")

    def test_unknown_timezone_does_not_crash(self):
        assert build(tz="Not/AZone")["current"]["temperature"] == 17.5

    def test_missing_current_block_still_yields_a_row(self):
        payload = sample()
        payload.pop("current")
        result = ws._build_weather_payload(payload, 1.0, 2.0, 7)
        assert result["current"]["temperature"] == 0.0
        assert result["current"]["condition"] == "Unknown"


class TestHourly:
    def test_rows_are_timestamp_aligned(self):
        rows = build(days=1)["hourly"]
        assert [row["localTime"] for row in rows] == HOURLY["time"]
        assert rows[2]["precipitation"] == 0.4
        assert rows[2]["condition"] == "Slight rain"

    def test_timestamps_are_stored_as_utc(self):
        first = build()["hourly"][0]
        assert first["timestamp"].endswith("Z")
        parsed = datetime.fromisoformat(first["timestamp"].replace("Z", "+00:00"))
        assert parsed.hour == 18  # 00:00 IST -> 18:30 UTC previous day

    def test_respects_forecast_days(self):
        assert len(build(days=1)["hourly"]) == 3

    def test_absent_series_yields_empty_list(self):
        payload = sample()
        payload["hourly"] = {}
        assert ws._build_weather_payload(payload, 1.0, 2.0, 7)["hourly"] == []

    def test_short_series_is_not_padded_with_errors(self):
        payload = sample()
        payload["hourly"] = {"time": ["2026-01-01T00:00"], "temperature_2m": [18.0]}
        rows = ws._build_weather_payload(payload, 1.0, 2.0, 7)["hourly"]
        assert len(rows) == 1
        assert rows[0]["uvIndex"] is None


class TestDaily:
    def test_rows_and_labels(self):
        rows = build()["daily"]
        assert len(rows) == 2
        assert rows[0]["condition"] == "Slight rain"
        assert rows[1]["condition"] == "Thunderstorm"
        assert rows[1]["temperatureMax"] == 20.0

    def test_sunrise_sunset_converted(self):
        rows = build()["daily"]
        assert rows[0]["sunrise"].endswith("Z")
        assert datetime.fromisoformat(rows[0]["sunset"].replace("Z", "+00:00")).hour == 12


class TestProvenance:
    def test_source_and_units_are_declared(self):
        payload = build()
        assert payload["source"] == "open-meteo"
        assert payload["units"]["temperature"] == "°C"
        assert payload["timezone"] == "Asia/Kolkata"
        assert payload["forecastDays"] == 7


class TestAiSummaries:
    def test_current_summary_mentions_key_numbers(self):
        payload = build()
        text = ws.current_weather_for_ai(payload, "Gudur")
        assert "Gudur" in text
        assert "17.5" in text
        assert "Mainly clear" in text

    def test_current_summary_handles_missing_payload(self):
        assert ws.current_weather_for_ai({}, "Gudur") == ""

    def test_forecast_summary_covers_requested_days(self):
        text = ws.forecast_summary_for_ai(build(), days=2)
        assert "2026-01-01" in text and "2026-01-02" in text

    def test_forecast_summary_handles_missing_payload(self):
        assert ws.forecast_summary_for_ai({}, days=3) == ""


class TestFetchValidation:
    async def test_bad_body_raises_provider_error(self, monkeypatch):
        from http_client import ProviderError

        async def fake(*args, **kwargs):
            return {"error": True}

        monkeypatch.setattr(ws, "request_json", fake)
        with pytest.raises(ProviderError):
            await ws.fetch_weather(1.0, 2.0)

    async def test_forecast_days_is_capped_at_seven(self, monkeypatch):
        seen: dict = {}

        async def fake(method, url, **kwargs):
            seen.update(kwargs.get("params") or {})
            return sample()

        monkeypatch.setattr(ws, "request_json", fake)
        await ws.fetch_weather(1.0, 2.0, forecast_days=99)
        assert seen["forecast_days"] == 7
