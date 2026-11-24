"""Additional API coverage for weather, air-quality and geocoding routes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import api.air as air_api
from api.deps import env_cache
from http_client import ProviderError
from services import air_quality_service, geocoding_service, weather_service


def _location() -> dict[str, object]:
    return {
        "name": "Gudur",
        "latitude": 17.38,
        "longitude": 78.49,
        "region": "AP",
        "country": "India",
    }


def _daily_payload() -> list[dict[str, object]]:
    return [
        {
            "date": f"2026-01-0{day}",
            "condition": "Clear sky",
            "conditionCode": 0,
            "temperatureMax": 32.0,
            "temperatureMin": 22.0,
            "precipitationSum": 0.0,
            "precipitationProbabilityMax": 10,
            "windSpeedMax": 15.0,
            "windDirectionDominant": 200,
            "uvIndexMax": 8.0,
            "sunrise": "2026-01-01T06:00:00Z",
            "sunset": "2026-01-01T18:00:00Z",
        }
        for day in (1, 2)
    ]


def _weather_payload(rows: int = 10) -> dict[str, object]:
    hourly = [
        {
            "timestamp": f"2026-01-01T{hour:02d}:00:00Z",
            "temperature": 30.0,
            "apparentTemperature": 31.0,
            "humidity": 60,
            "precipitation": 0.0,
            "precipitationProbability": 10,
            "windSpeed": 12.0,
            "windDirection": 200,
            "cloudCover": 20,
            "condition": "Clear sky",
            "conditionCode": 0,
            "uvIndex": 1.0,
        }
        for hour in range(rows)
    ]
    return {
        "current": {
            "temperature": 31.0,
            "feelsLike": 35.0,
            "humidity": 60,
            "windSpeed": 12.0,
            "windDirection": 200,
            "precipitation": 0.0,
            "cloudCover": 20,
            "pressure": 1010.0,
            "uvIndex": 8.0,
            "visibility": 20000.0,
            "isDay": True,
            "condition": "Clear sky",
            "conditionCode": 0,
            "observedAt": "2026-01-01T00:00:00Z",
            "precipitationProbability": 10,
        },
        "hourly": hourly,
        "daily": _daily_payload(),
        "units": {"temperature": "°C"},
        "source": "open-meteo",
        "timestamp": "2026-01-01T00:00:00Z",
    }


def _aqi_payload() -> dict[str, object]:
    return {
        "aqi": 142,
        "status": "Unhealthy for Sensitive Groups",
        "dominantPollutant": "PM2.5",
        "healthAdvisory": "Limit prolonged outdoor exertion.",
        "location": _location(),
        "pollutants": [
            {
                "id": "pm25",
                "name": "PM2.5",
                "value": 55.0,
                "unit": "µg/m³",
                "status": "High",
                "description": "Fine particles",
                "safeLimit": 35.0,
            }
        ],
        "timestamp": "2026-01-01T00:00:00Z",
        "source": "open-meteo",
        "isEstimated": False,
    }


def _patch_location(
    monkeypatch: pytest.MonkeyPatch, seen: list[tuple[float | None, float | None, str | None]]
) -> None:
    async def resolve(
        lat: float | None, lon: float | None, city: str | None
    ) -> tuple[dict[str, object], str]:
        seen.append((lat, lon, city))
        return _location(), "coordinates"

    monkeypatch.setattr(air_quality_service, "resolve_location", resolve)


def test_weather_route_truncates_hourly_and_keys_cache_by_hours(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[float, float, int]] = []

    async def fetch(lat: float, lon: float, forecast_days: int) -> dict[str, object]:
        calls.append((lat, lon, forecast_days))
        return _weather_payload(10)

    monkeypatch.setattr(weather_service, "fetch_weather", fetch)
    _patch_location(monkeypatch, [])

    first = client.get("/api/weather?lat=17.38&lon=78.49&days=2&hours=6", headers=auth)
    second = client.get("/api/weather?lat=17.38&lon=78.49&days=2&hours=7", headers=auth)
    third = client.get("/api/weather?lat=17.38&lon=78.49&days=2&hours=6", headers=auth)

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 200
    assert len(first.json()["hourly"]) == 6
    assert len(second.json()["hourly"]) == 7
    assert len(third.json()["hourly"]) == 6
    assert calls == [(17.38, 78.49, 2), (17.38, 78.49, 2)]
    assert env_cache.misses == 2
    assert env_cache.hits == 1
    assert third.json()["timestamp"].endswith("Z")


def test_weather_route_geocodes_a_city_when_coordinates_are_absent(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[float | None, float | None, str | None]] = []

    async def fetch(lat: float, lon: float, forecast_days: int) -> dict[str, object]:
        return _weather_payload(6)

    monkeypatch.setattr(weather_service, "fetch_weather", fetch)
    _patch_location(monkeypatch, seen)

    response = client.get("/api/weather?city=Gudur&days=1&hours=6", headers=auth)

    assert response.status_code == 200
    assert seen == [(None, None, "Gudur")]
    assert response.json()["location"]["name"] == "Gudur"
    assert len(response.json()["hourly"]) == 6


def test_weather_summary_uses_fallbacks_and_reuses_the_cache(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _weather_payload(2)
    payload["current"] = None
    del payload["source"]
    calls: list[int] = []

    async def fetch(lat: float, lon: float, forecast_days: int) -> dict[str, object]:
        calls.append(forecast_days)
        return payload

    monkeypatch.setattr(weather_service, "fetch_weather", fetch)
    _patch_location(monkeypatch, [])

    first = client.get("/api/weather/summary?lat=17.38&lon=78.49&days=1", headers=auth)
    second = client.get("/api/weather/summary?lat=17.38&lon=78.49&days=1", headers=auth)

    assert first.status_code == 200
    assert calls == [1]
    assert env_cache.hits == 1
    body_one = first.json()
    body_two = second.json()
    timestamp = body_one.pop("timestamp")
    body_two.pop("timestamp")
    assert timestamp.endswith("Z")
    assert body_one == body_two
    assert body_one == {
        "location": _location(),
        "current": {},
        "daily": _daily_payload()[:1],
        "source": weather_service.SOURCE,
    }


def test_aqi_route_uses_the_city_path_without_coordinates(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, object]] = []

    async def fake_aqi(**kwargs: object) -> dict[str, object]:
        calls.append(kwargs)
        return _aqi_payload()

    monkeypatch.setattr(air_quality_service, "get_air_quality", fake_aqi)

    response = client.get("/api/aqi?city=Gudur", headers=auth)

    assert response.status_code == 200
    assert calls == [{"city": "Gudur"}]
    assert response.json()["aqi"] == 142


def test_aqi_route_shares_one_cached_reading_between_callers(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, object]] = []

    async def fake_aqi(**kwargs: object) -> dict[str, object]:
        calls.append(kwargs)
        return _aqi_payload()

    monkeypatch.setattr(air_quality_service, "get_air_quality", fake_aqi)

    first = client.get("/api/aqi?lat=17.38&lon=78.49", headers=auth)
    second = client.get("/api/aqi?lat=17.38&lon=78.49", headers=auth)

    assert first.status_code == 200
    assert first.json() == second.json()
    assert calls == [{"lat": 17.38, "lon": 78.49}]
    assert env_cache.misses == 1
    assert env_cache.hits == 1


def test_aqi_history_clamps_an_unbounded_range(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[str, str]] = []
    _patch_location(monkeypatch, [])

    async def fake_history(lat: float, lon: float, start: str, end: str) -> list[dict[str, object]]:
        seen.append((start, end))
        return []

    monkeypatch.setattr(air_quality_service, "fetch_aqi_history", fake_history)

    response = client.get(
        "/api/aqi/history?lat=17.38&lon=78.49&start=2019-01-01&end=2999-01-01", headers=auth
    )

    today = datetime.now(UTC).date()
    assert response.status_code == 200
    assert seen == [(str(today - timedelta(days=366)), today.isoformat())]
    body = response.json()
    assert body["startDate"] == str(today - timedelta(days=366))
    assert body["endDate"] == today.isoformat()
    assert body["points"] == []
    assert body["source"] == "open-meteo-air"


def test_aqi_history_defaults_to_the_last_thirty_days(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[str, str]] = []
    _patch_location(monkeypatch, [])

    async def fake_history(lat: float, lon: float, start: str, end: str) -> list[dict[str, object]]:
        seen.append((start, end))
        return []

    monkeypatch.setattr(air_quality_service, "fetch_aqi_history", fake_history)

    response = client.get("/api/aqi/history?lat=17.38&lon=78.49", headers=auth)

    today = datetime.now(UTC).date()
    assert response.status_code == 200
    assert seen == [(str(today - timedelta(days=29)), today.isoformat())]


def test_predictions_falls_back_to_the_labelled_heuristic_when_no_provider_forecast_exists(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_location(monkeypatch, [])

    async def no_forecast(lat: float, lon: float, days: int) -> list[dict[str, object]]:
        return []

    async def current(lat: float, lon: float) -> dict[str, object]:
        return _aqi_payload()

    monkeypatch.setattr(air_quality_service, "fetch_aqi_forecast", no_forecast)
    monkeypatch.setattr(air_quality_service, "get_air_quality", current)

    response = client.get("/api/predictions?lat=17.38&lon=78.49&days=5", headers=auth)

    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "heuristic-prototype"
    assert body["source"] == "heuristic"
    assert body["horizonHours"] == 24
    assert body["note"] == (
        "No forecasting provider was reachable, so these values are a diurnal-scaling "
        "prototype estimate derived from the current reading. They are not a validated "
        "model and must not be presented as a real forecast."
    )
    assert [row["timeOffsetHours"] for row in body["predictions"]] == air_api.FORECAST_OFFSETS
    assert body["predictions"][0]["label"] == "Now"
    assert body["predictions"][0]["confidence"] == 100
    assert all(row["pm25"] > 0 for row in body["predictions"])


def test_nearest_provider_hour_skips_bad_timestamps_and_enforces_the_gap() -> None:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    points: list[dict[str, object]] = [
        {"timestamp": "not-a-time", "aqi": 1},
        {"timestamp": None, "aqi": 2},
        {"timestamp": "2026-01-01T12:30:00", "aqi": 3},
    ]

    nearby = air_api._nearest_hour(points, 0, now)
    assert nearby is not None
    assert nearby["aqi"] == 3

    far: list[dict[str, object]] = [{"timestamp": "2026-01-01T14:00:00Z", "aqi": 9}]
    assert air_api._nearest_hour(far, 0, now) is None


def test_provider_forecast_clamps_aqi_and_uses_safe_label_fallbacks() -> None:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    points = [
        {
            "timestamp": "2026-01-01T12:00:00Z",
            "aqi": -5,
            "pm25": 1.0,
            "pm10": 2.0,
            "no2": 3.0,
            "so2": 4.0,
            "co": 5.0,
            "o3": 6.0,
            "dominant": "unknown",
        }
    ]

    forecasts = air_api._from_provider(points, now)

    assert len(forecasts) == 1
    assert forecasts[0]["aqi"] == 1
    assert forecasts[0]["label"] == "Now"
    assert forecasts[0]["confidence"] == 100
    assert forecasts[0]["dominantPollutant"] == "PM2.5"
    assert forecasts[0]["status"] == "Good"


def test_heuristic_forecast_uses_default_concentrations_for_missing_pollutants() -> None:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    forecasts = air_api._heuristic_forecast(80, [], now)

    assert [row["timeOffsetHours"] for row in forecasts] == air_api.FORECAST_OFFSETS
    assert all(row["pm25"] > 0 and row["co"] > 0 for row in forecasts)


def test_geocode_search_normalizes_the_query_and_counts_a_cache_hit(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, int]] = []

    async def search(query: str, limit: int = 5) -> list[dict[str, object]]:
        calls.append((query, limit))
        return [{"name": "Chennai", "latitude": 13.08, "longitude": 80.27}]

    monkeypatch.setattr(geocoding_service, "search_places", search)

    first = client.get("/api/geocode/search", params={"q": "  Chennai  ", "limit": 2}, headers=auth)
    second = client.get("/api/geocode/search", params={"q": "chennai", "limit": 2}, headers=auth)

    assert first.status_code == 200
    assert calls == [("Chennai", 2)]
    assert env_cache.misses == 1
    assert env_cache.hits == 1
    expected = {
        "places": [
            {
                "name": "Chennai",
                "latitude": 13.08,
                "longitude": 80.27,
                "region": "",
                "country": "",
                "label": "",
            }
        ]
    }
    assert first.json() == expected
    assert second.json() == expected


def test_geocode_reverse_buckets_coordinates_into_one_cache_entry(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[float, float]] = []

    async def reverse(lat: float, lon: float) -> dict[str, object]:
        calls.append((lat, lon))
        return {"name": "Gudur", "latitude": lat, "longitude": lon}

    monkeypatch.setattr(geocoding_service, "safe_reverse_geocode", reverse)

    first = client.get("/api/geocode/reverse", params={"lat": 17.3811, "lon": 78.4901}, headers=auth)
    second = client.get("/api/geocode/reverse", params={"lat": 17.3812, "lon": 78.4902}, headers=auth)

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == [(17.3811, 78.4901)]
    assert env_cache.misses == 1
    assert env_cache.hits == 1
    assert first.json()["places"][0]["name"] == "Gudur"


@pytest.mark.parametrize(
    ("path", "field"),
    [
        ("/api/geocode/search?q=a", "q"),
        ("/api/geocode/search?q=Chennai&limit=0", "limit"),
        ("/api/geocode/search?q=Chennai&limit=11", "limit"),
        ("/api/geocode/reverse?lat=91&lon=0", "lat"),
        ("/api/geocode/reverse?lat=0&lon=181", "lon"),
    ],
)
def test_geocode_query_validation_reports_the_offending_field(
    client: TestClient, auth: dict[str, str], path: str, field: str
) -> None:
    response = client.get(path, headers=auth)
    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid request."
    assert [problem["field"] for problem in response.json()["problems"]] == [field]


def test_geocode_upstream_failure_is_reported_as_service_unavailable(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def down(query: str, limit: int = 5) -> list[dict[str, object]]:
        raise ProviderError("nominatim", "connection refused")

    monkeypatch.setattr(geocoding_service, "search_places", down)

    response = client.get("/api/geocode/search?q=Chennai", headers=auth)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The nominatim data provider is temporarily unavailable. Please try again shortly."
    }
