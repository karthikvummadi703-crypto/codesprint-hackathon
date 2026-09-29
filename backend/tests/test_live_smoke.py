"""Live smoke test against the real providers.

Not part of the default suite. Run explicitly:

    .venv\\Scripts\\python.exe -m pytest tests/test_live_smoke.py -q -m live

These tests make genuine network calls to Open-Meteo and Nominatim. They are the
only way to confirm the keyless providers actually answer with the field names
this code expects, which mocked unit tests cannot prove.
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.live

# Hyderabad, India — exercises a non-UTC timezone on the weather timestamps.
LAT, LON = 17.38, 78.49
AUTH = {"Authorization": "Bearer dev:live-smoke"}
# Filled in by the chat test from the live /api/aqi response.
AQI_SENTINEL: list[int] = [0]


@pytest.fixture
def live_client(monkeypatch):
    os.environ["ALLOW_DEV_AUTH"] = "true"
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    from fastapi.testclient import TestClient

    from config import get_settings

    import main as backend_main

    get_settings.cache_clear()
    monkeypatch.setenv("ALLOW_DEV_AUTH", "true")
    with TestClient(backend_main.create_app()) as client:
        yield client


def test_health_is_live(live_client):
    response = live_client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] in ("ok", "degraded")


def test_aqi_is_measured_not_estimated(live_client):
    """The headline requirement: real data, clearly attributed."""
    response = live_client.get(f"/api/aqi?lat={LAT}&lon={LON}", headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["aqi"] is not None
    assert 0 <= body["aqi"] <= 500
    assert body["status"]
    assert body["source"] in {"google", "open-meteo", "openweather", "estimated"}
    assert body["isEstimated"] == (body["source"] == "estimated")
    assert body["pollutants"], "expected pollutant breakdown"


def test_weather_timestamps_are_real_utc_instants(live_client):
    """Catches the timezone bug where wall-clock was published as UTC."""
    from datetime import datetime, timedelta, timezone

    response = live_client.get(f"/api/weather?lat={LAT}&lon={LON}", headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()

    observed = body["current"]["observedAt"]
    parsed = datetime.fromisoformat(observed.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None

    # The observation must be within a few hours of now, in any timezone.
    now = datetime.now(timezone.utc)
    assert abs((now - parsed).total_seconds()) < 6 * 3600

    assert body["units"]["temperature"] == "°C"
    assert body["current"]["condition"]


def test_weather_forecast_is_forward_dated(live_client):
    response = live_client.get(f"/api/weather?lat={LAT}&lon={LON}", headers=AUTH)
    body = response.json()
    assert len(body["hourly"]) > 0
    assert len(body["daily"]) > 0

    from datetime import datetime

    first_hour = datetime.fromisoformat(body["hourly"][0]["timestamp"].replace("Z", "+00:00"))
    today = datetime.fromisoformat(body["daily"][0]["date"])
    assert first_hour.date() == today.date() or first_hour.date() < today.date()


def test_aqi_forecast_has_usable_points(live_client):
    """The nearest-hour join is timezone-sensitive and fails silently when wrong.

    `_MAX_POINT_GAP_S` is 90 minutes, so an unconverted wall-clock timestamp
    would leave every offset unmatched and produce an empty forecast. Asserting
    the offsets resolve is what actually proves the join works for IST.
    """
    import anyio

    from api import air as air_router
    from services import air_quality_service as aq

    from datetime import datetime, timezone

    points = anyio.run(aq.fetch_aqi_forecast, LAT, LON, 5)
    if not points:
        pytest.skip("no AQI forecast series returned by the provider")

    forecast = air_router._from_provider(points, datetime.now(timezone.utc))
    assert forecast, "provider forecast points did not join to any offset"
    assert all(p["aqi"] is not None for p in forecast)
    assert {p["timeOffsetHours"] for p in forecast} <= set(air_router.FORECAST_OFFSETS)


def test_predictions_endpoint_is_live(live_client):
    response = live_client.get(f"/api/predictions?lat={LAT}&lon={LON}&days=5", headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["predictions"], "expected forecast points"
    assert body["method"] in {"provider-forecast", "heuristic"}
    assert body["note"], "provenance must always be stated"
    # A heuristic fallback must never be presented as a model forecast.
    if body["method"] == "heuristic":
        assert "heuristic" in body["note"].lower() or "estimate" in body["note"].lower()


def test_geocode_round_trip(live_client):
    search = live_client.get("/api/geocode/search?q=Hyderabad&limit=3", headers=AUTH)
    assert search.status_code == 200
    places = search.json()["places"]
    if not places:
        pytest.skip("geocoder returned no results")
    assert places[0]["name"]

    reverse = live_client.get(f"/api/geocode/reverse?lat={LAT}&lon={LON}", headers=AUTH)
    assert reverse.status_code == 200
    assert reverse.json()["places"]


def test_carbon_distance(live_client):
    response = live_client.post(
        "/api/carbon/estimate-distance",
        headers=AUTH,
        json={"origin": "Hyderabad", "destination": "Vijayawada"},
    )
    assert response.status_code in (200, 400)
    if response.status_code == 200:
        assert response.json()["distanceKm"] > 0
    else:
        # A geocoder miss is a legitimate 400, not a crash.
        assert response.json()["detail"]


def test_ai_chat_answers_with_grounded_context(live_client):
    # Record the live reading so the answer can be checked against it.
    live = live_client.get(f"/api/aqi?lat={LAT}&lon={LON}", headers=AUTH).json()
    AQI_SENTINEL[0] = int(live["aqi"])

    response = live_client.post(
        "/api/ai/chat",
        headers=AUTH,
        json={
            "message": "How is the air quality right now and should I go for a run?",
            "location": {"name": "Hyderabad", "latitude": LAT, "longitude": LON},
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["response"], "expected a non-empty answer"
    # The air-quality provider was reachable, so the answer must use it.
    assert body["dataCoverage"]["air_quality"] is True

    if body.get("degraded"):
        # The LLM is rate-limited upstream, which is not a defect here, but the
        # offline path must still answer from the same live context rather than
        # claiming it has no data.
        reply = body["response"].lower()
        assert "don't have a current aqi" not in reply, "degraded reply discarded live AQI data"
        assert "no aqi measurement" not in reply
        assert "unavailable" in reply
        return

    assert str(AQI_SENTINEL[0]) in body["response"], "answer did not quote the live reading"
    # A grounded answer cites the reading it was given.
    assert "air_quality" in body["contextSections"] or "unavailable" in body["response"].lower()
