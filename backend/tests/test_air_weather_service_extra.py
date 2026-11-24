"""Additional air-quality and weather service branches without live providers."""

from __future__ import annotations

import pytest

from http_client import ProviderError
from services import air_quality_service as aq
from services import weather_service as weather


@pytest.mark.parametrize(
    ("code", "family"),
    [
        (0, "clear"),
        (1, "partly-cloudy"),
        (3, "overcast"),
        (45, "fog"),
        (55, "drizzle"),
        (63, "rain"),
        (75, "snow"),
        (81, "showers"),
        (99, "thunderstorm"),
    ],
)
def test_weather_codes_map_to_families(code: int, family: str) -> None:
    assert weather.weather_family(code) == family


def test_weather_descriptions_fall_back_to_unknown() -> None:
    assert weather.describe_weather(None) == "Unknown"
    assert weather.describe_weather(999) == "Unknown"
    assert weather.describe_weather(95) == "Thunderstorm"


async def test_city_is_preferred_when_coordinates_are_secondary(monkeypatch: pytest.MonkeyPatch) -> None:
    async def geocode_one(city: str) -> dict[str, object]:
        return {
            "name": city,
            "latitude": 28.61,
            "longitude": 77.2,
            "region": "Delhi",
            "country": "India",
        }

    monkeypatch.setattr(aq.geocoding_service, "geocode_one", geocode_one)
    location, source = await aq.resolve_location(17.38, 78.49, "Delhi", prefer_coordinates=False)
    assert source == "geocoded"
    assert location["latitude"] == pytest.approx(28.61)
    assert location["name"] == "Delhi"


async def test_unresolvable_city_falls_back_to_a_coordinate_label(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_place(city: str) -> None:
        assert city
        return None

    monkeypatch.setattr(aq.geocoding_service, "geocode_one", no_place)
    location, source = await aq.resolve_location(17.38, 78.49, "Nowhere", prefer_coordinates=False)
    assert source == "coordinates"
    assert location["name"] == "17.380, 78.490"


async def test_provider_gaps_are_filled_by_computed_values(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_location(
        lat: float | None = None,
        lon: float | None = None,
        city: str | None = None,
        **kwargs: object,
    ) -> tuple[dict[str, object], str]:
        return {"name": "Test city", "latitude": 17.38, "longitude": 78.49}, "coordinates"

    async def fake_components(lat: float, lon: float) -> dict[str, object]:
        return {
            "components": {"pm2_5": 35.0},
            "aqi": -5,
            "status": "Not a status",
            "dominant": "unknown-pollutant",
            "advisory": "",
            "source": "open-meteo",
        }

    monkeypatch.setattr(aq, "resolve_location", fake_location)
    monkeypatch.setattr(aq, "fetch_aqi_components", fake_components)
    result = await aq.get_air_quality(17.38, 78.49)
    assert result["aqi"] >= 1
    assert result["status"] in {
        "Good",
        "Moderate",
        "Unhealthy for Sensitive Groups",
        "Unhealthy",
        "Very Unhealthy",
        "Hazardous",
    }
    assert result["dominantPollutant"] in aq.DOMINANT_LABELS.values()
    assert result["healthAdvisory"]
    assert result["isEstimated"] is False
    assert result["forecastAvailable"] is True
    assert result["location"]["source"] == "coordinates"


async def test_valid_provider_fields_are_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_location(
        lat: float | None = None,
        lon: float | None = None,
        city: str | None = None,
        **kwargs: object,
    ) -> tuple[dict[str, object], str]:
        return {"name": "Test city", "latitude": 17.38, "longitude": 78.49}, "default"

    async def fake_components(lat: float, lon: float) -> dict[str, object]:
        return {
            "components": {"pm2_5": 35.0},
            "aqi": 42,
            "status": "Good",
            "dominant": "pm25",
            "advisory": "Custom advice",
            "source": "open-meteo",
        }

    monkeypatch.setattr(aq, "resolve_location", fake_location)
    monkeypatch.setattr(aq, "fetch_aqi_components", fake_components)
    result = await aq.get_air_quality()
    assert result["aqi"] == 42
    assert result["status"] == "Good"
    assert result["dominantPollutant"] == aq.DOMINANT_LABELS["pm25"]
    assert result["healthAdvisory"] == "Custom advice"


def test_estimates_are_deterministic_including_the_zero_seed() -> None:
    first = aq.build_estimated_components(17.38, 78.49)
    assert first == aq.build_estimated_components(17.38, 78.49)
    assert aq.build_estimated_components(0.0, 0.0) == aq.build_estimated_components(0.0001, 0.0001)
    assert aq._estimated_change(80) == aq._estimated_change(80)
    assert -12 <= aq._estimated_change(80) <= 15


def test_modelled_history_is_anchored_to_the_reading() -> None:
    points = aq.build_historical(100, {"pm2_5": 50.0})
    assert len(points) == 12
    assert points[0]["time"] == "00:00"
    assert all(point["aqi"] >= 20 for point in points)
    assert points[0]["pm25"] > 0
    assert all("co" in point for point in points)


def test_hour_slot_index_skips_unparseable_hourly_stamps() -> None:
    assert weather._hour_slot_index("2026-01-01T14:15", ["not-a-time", "2026-01-01T15:00"]) == 1


async def test_fetch_weather_clamps_days_and_requires_a_current_block(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[object] = []

    async def fake_request(method: str, url: str, **kwargs: object) -> object:
        seen.append(kwargs["params"])
        return {"current": {"time": "2026-01-01T12:00"}}

    monkeypatch.setattr(weather, "request_json", fake_request)
    payload = await weather.fetch_weather(1.0, 2.0, 99)
    assert payload["forecastDays"] == 7
    assert isinstance(seen[0], dict)
    assert seen[0]["forecast_days"] == 7
    await weather.fetch_weather(1.0, 2.0, 0)
    assert isinstance(seen[1], dict)
    assert seen[1]["forecast_days"] == 1

    async def no_current(method: str, url: str, **kwargs: object) -> object:
        return {"hourly": {}}

    monkeypatch.setattr(weather, "request_json", no_current)
    with pytest.raises(ProviderError, match="missing 'current'"):
        await weather.fetch_weather(1.0, 2.0)


@pytest.mark.parametrize(
    ("stamp", "zone", "expected"),
    [
        ("", "UTC", ""),
        ("not-a-time", "UTC", "not-a-time"),
        ("2026-01-01T12:00", "UTC", "2026-01-01T12:00:00Z"),
        ("2026-01-01T12:00", "Asia/Kolkata", "2026-01-01T06:30:00Z"),
        ("2026-01-01T12:00", "Not/AZone", "2026-01-01T12:00:00Z"),
    ],
)
def test_timestamp_conversion_handles_timezones_and_failures(stamp: str, zone: str, expected: str) -> None:
    assert weather._to_utc_iso(stamp, zone) == expected


def test_weather_payload_uses_defaults_when_series_are_missing() -> None:
    payload = weather._build_weather_payload({"current": {}}, 0.0, 0.0, 2)
    current = payload["current"]
    assert current["temperature"] == 0.0
    assert current["conditionCode"] == -1
    assert current["uvIndex"] is None
    assert current["visibility"] is None
    assert current["precipitationProbability"] is None
    assert current["observedAt"] == ""
    assert payload["hourly"] == []
    assert payload["daily"] == []
    assert payload["forecastDays"] == 2


def test_hourly_and_daily_builders_fill_missing_fields() -> None:
    hourly = {"time": ["2026-01-01T12:00"], "temperature_2m": ["bad"]}
    rows = weather._build_hourly(hourly, "UTC", 1)
    assert len(rows) == 1
    assert rows[0]["temperature"] == 0.0
    assert rows[0]["uvIndex"] is None
    assert rows[0]["condition"] == "Unknown"
    assert rows[0]["conditionCode"] == -1
    assert weather._at(hourly, "weather_code", 5) is None

    daily_rows = weather._build_daily({"time": ["2026-01-01"]}, "UTC")
    assert daily_rows[0]["sunrise"] is None
    assert daily_rows[0]["sunset"] is None
    assert daily_rows[0]["temperatureMax"] == 0.0


def test_ai_summaries_include_optional_values_and_handle_empty_data() -> None:
    assert weather.current_weather_for_ai({}, "City") == ""
    assert weather.forecast_summary_for_ai({}, 3) == ""
    summary = weather.current_weather_for_ai(
        {
            "current": {
                "temperature": 30.0,
                "feelsLike": 33.0,
                "condition": "Clear sky",
                "humidity": 50,
                "windSpeed": 8.0,
                "precipitation": 1.5,
                "uvIndex": 8.0,
            }
        },
        "City",
    )
    assert summary.startswith("City: 30.0°C")
    assert "precip 1.5 mm" in summary
    assert "UV 8.0" in summary
    forecast = weather.forecast_summary_for_ai(
        {
            "daily": [
                {
                    "date": "2026-01-01",
                    "condition": "Clear sky",
                    "temperatureMin": 20.0,
                    "temperatureMax": 30.0,
                    "precipitationProbabilityMax": 90,
                }
            ]
        },
        3,
    )
    assert "2026-01-01: Clear sky" in forecast
    assert "rain 90%" in forecast


@pytest.mark.parametrize("value", ["bad", None])
def test_scalar_helpers_return_defaults_for_bad_values(value: str | None) -> None:
    assert weather._as_float(value) == 0.0
    assert weather._as_int(value) is None
    assert weather._as_opt_float(value) is None
