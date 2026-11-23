"""Deterministic error-path coverage for every API router."""

from __future__ import annotations

import time as real_time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main as backend_main
import middleware
from config import get_settings
from http_client import ProviderError
from middleware import _counters
from services import (
    ai_service,
    air_quality_service,
    carbon_service,
    firebase_service,
    geocoding_service,
    rag_service,
    weather_service,
)

AUTH = {"Authorization": "Bearer dev:test-user"}
FROZEN_MONOTONIC = 1000.0


@pytest.fixture
def invalid_token(monkeypatch):
    async def _invalid(_token: str) -> None:
        return None

    monkeypatch.setattr(firebase_service, "verify_id_token", _invalid)
    return {"Authorization": "Bearer invalid-token"}


@pytest.fixture
def stub_location(monkeypatch):
    async def _location(lat=None, lon=None, city=None, **_kwargs):
        place = {
            "name": "Test City",
            "latitude": 17.38,
            "longitude": 78.49,
            "region": "",
            "country": "India",
        }
        return place, "coordinates"

    monkeypatch.setattr(air_quality_service, "resolve_location", _location)


@pytest.fixture
def limited_client(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RATE_LIMIT_REQUESTS", "2")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_S", "60")
    monkeypatch.setenv("RATE_LIMIT_CHAT_REQUESTS", "2")
    monkeypatch.setenv("RATE_LIMIT_CHAT_WINDOW_S", "300")
    monkeypatch.setattr(
        middleware,
        "time",
        SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC, perf_counter=real_time.perf_counter),
    )
    _counters.reset()
    get_settings.cache_clear()
    with TestClient(backend_main.create_app()) as test_client:
        yield test_client
    _counters.reset()
    get_settings.cache_clear()


class TestValidationErrors:
    @pytest.mark.parametrize(
        ("query", "field"),
        [
            ("lat=91&lon=0", "lat"),
            ("lat=0&lon=181", "lon"),
            ("city=", "city"),
        ],
    )
    def test_aqi_query_validation(self, client, auth, query, field):
        response = client.get(f"/api/aqi?{query}", headers=auth)
        assert response.status_code == 422
        body = response.json()
        assert body["detail"] == "Invalid request."
        assert any(problem["field"] == field for problem in body["problems"])

    @pytest.mark.parametrize(
        ("query", "detail"),
        [
            ("lat=17.38", "lat and lon must be provided together"),
            ("", "Provide either lat/lon or a city name"),
        ],
    )
    def test_aqi_location_pair_errors(self, client, auth, query, detail):
        response = client.get(f"/api/aqi?{query}", headers=auth)
        assert response.status_code == 422
        assert response.json() == {"detail": detail}

    def test_predictions_rejects_out_of_range_days(self, client, auth):
        response = client.get("/api/predictions?lat=17.38&lon=78.49&days=0", headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == "days" for p in response.json()["problems"])

    def test_aqi_history_rejects_reversed_range(self, client, auth, stub_location):
        response = client.get(
            "/api/aqi/history?lat=17.38&lon=78.49&start=2023-11-03&end=2023-11-01",
            headers=auth,
        )
        assert response.status_code == 422
        assert response.json() == {"detail": "start must be on or before end"}

    @pytest.mark.parametrize(
        ("query", "field"),
        [
            ("lat=91&lon=0", "lat"),
            ("lat=17.38&lon=78.49&days=0", "days"),
        ],
    )
    def test_weather_query_validation(self, client, auth, query, field):
        response = client.get(f"/api/weather?{query}", headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == field for p in response.json()["problems"])

    def test_weather_summary_rejects_out_of_range_days(self, client, auth):
        response = client.get("/api/weather/summary?city=Gudur&days=8", headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == "days" for p in response.json()["problems"])

    @pytest.mark.parametrize(
        ("query", "field"),
        [
            ("q=x", "q"),
            ("q=Chennai&limit=0", "limit"),
            ("q=Chennai&limit=11", "limit"),
        ],
    )
    def test_geocode_search_validation(self, client, auth, query, field):
        response = client.get(f"/api/geocode/search?{query}", headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == field for p in response.json()["problems"])

    def test_geocode_reverse_validation(self, client, auth):
        response = client.get("/api/geocode/reverse?lat=91&lon=0", headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == "lat" for p in response.json()["problems"])

    def test_chat_message_validation(self, client, auth):
        response = client.post("/api/ai/chat", json={"message": ""}, headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == "message" for p in response.json()["problems"])

    def test_chat_document_ids_limit(self, client, auth):
        response = client.post(
            "/api/ai/chat",
            json={"message": "hello", "documentIds": ["a", "b", "c", "d", "e", "f"]},
            headers=auth,
        )
        assert response.status_code == 422
        assert any(p["field"] == "documentIds" for p in response.json()["problems"])

    def test_chat_history_turn_validation(self, client, auth):
        response = client.post(
            "/api/ai/chat",
            json={"message": "hello", "history": [{"role": "user", "content": ""}]},
            headers=auth,
        )
        assert response.status_code == 422
        assert any(p["field"] == "history.0.content" for p in response.json()["problems"])

    def test_rag_upload_requires_a_file(self, client, auth):
        response = client.post("/api/rag/upload", headers=auth)
        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid request."
        assert any(p["field"] == "file" for p in response.json()["problems"])

    @pytest.mark.parametrize(
        ("payload", "field"),
        [
            ({"origin": "", "destination": "X"}, "origin"),
            ({"origin": "A", "destination": "B", "distanceKm": 0}, "distanceKm"),
            ({"origin": "A", "destination": "B", "distanceKm": 20_001}, "distanceKm"),
        ],
    )
    def test_carbon_calculate_validation(self, client, auth, payload, field):
        response = client.post("/api/carbon/calculate", json=payload, headers=auth)
        assert response.status_code == 422
        assert any(p["field"] == field for p in response.json()["problems"])

    def test_estimate_distance_requires_both_places(self, client, auth):
        response = client.post("/api/carbon/estimate-distance", json={}, headers=auth)
        assert response.status_code == 422
        assert {p["field"] for p in response.json()["problems"]} == {"origin", "destination"}


class TestAuthenticationErrors:
    @pytest.mark.parametrize(
        ("method", "path", "payload"),
        [
            ("get", "/api/aqi?lat=17.38&lon=78.49", None),
            ("get", "/api/weather?lat=17.38&lon=78.49", None),
            ("get", "/api/geocode/search?q=Chennai", None),
            ("post", "/api/carbon/calculate", {"origin": "A", "destination": "B", "distanceKm": 10}),
        ],
        ids=["air", "weather", "geocode", "carbon"],
    )
    def test_public_routes_reject_an_invalid_token(self, client, invalid_token, method, path, payload):
        response = client.request(method, path, json=payload, headers=invalid_token)
        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid or expired token"}

    @pytest.mark.parametrize(
        ("method", "path", "payload"),
        [
            ("post", "/api/ai/chat", {"message": "hello"}),
            ("get", "/api/rag/files", None),
            ("post", "/api/rag/upload", None),
        ],
        ids=["ai", "rag-files", "rag-upload"],
    )
    def test_private_routes_require_a_token(self, client, method, path, payload):
        response = client.request(method, path, json=payload)
        assert response.status_code == 401
        assert response.json() == {"detail": "Missing authentication token"}

    def test_dev_token_rejected_when_dev_auth_is_disabled(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("ALLOW_DEV_AUTH", "true")
        get_settings.cache_clear()
        with TestClient(backend_main.create_app()) as production_client:
            response = production_client.get("/api/rag/files", headers=AUTH)
        get_settings.cache_clear()
        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid or expired token"}


class TestRateLimiting:
    @pytest.mark.parametrize(
        ("method", "path", "payload", "allowed_status", "retry_after"),
        [
            ("get", "/api/health", None, 200, "61"),
            ("get", "/api/aqi", None, 422, "61"),
            ("get", "/api/weather", None, 422, "61"),
            ("get", "/api/geocode/search?q=x", None, 422, "61"),
            ("post", "/api/ai/chat", {}, 422, "301"),
            ("post", "/api/rag/upload", None, 422, "301"),
            ("post", "/api/carbon/calculate", {}, 422, "61"),
        ],
        ids=["health", "air", "weather", "geocode", "ai", "rag", "carbon"],
    )
    def test_third_api_call_is_rate_limited(
        self, limited_client, method, path, payload, allowed_status, retry_after
    ):
        statuses = []
        for _ in range(2):
            response = limited_client.request(method, path, json=payload, headers=AUTH)
            statuses.append(response.status_code)
            assert response.headers["X-RateLimit-Limit"] == "2"
        assert statuses == [allowed_status, allowed_status]

        blocked = limited_client.request(method, path, json=payload, headers=AUTH)
        assert blocked.status_code == 429
        assert blocked.json() == {"detail": "Too many requests. Please wait a moment and try again."}
        assert blocked.headers["Retry-After"] == retry_after


class TestProviderFailures:
    def test_air_chain_exhaustion_returns_estimated_payload(self, client, auth, stub_location, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("open-meteo-air", "offline")

        monkeypatch.setattr(air_quality_service, "request_json", _down)
        response = client.get("/api/aqi?lat=17.38&lon=78.49", headers=auth)
        assert response.status_code == 200
        body = response.json()
        assert body["source"] == "estimated"
        assert body["isEstimated"] is True
        assert body["forecastAvailable"] is False

    def test_air_history_provider_error_returns_503(self, client, auth, stub_location, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("open-meteo-air", "offline")

        monkeypatch.setattr(air_quality_service, "fetch_aqi_history", _down)
        response = client.get(
            "/api/aqi/history?lat=17.38&lon=78.49&start=2023-11-01&end=2023-11-03",
            headers=auth,
        )
        assert response.status_code == 503
        assert response.json()["detail"] == (
            "The open-meteo-air data provider is temporarily unavailable. Please try again shortly."
        )

    def test_weather_provider_failure_returns_503(self, client, auth, stub_location, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("open-meteo", "offline")

        monkeypatch.setattr(weather_service, "request_json", _down)
        response = client.get("/api/weather?lat=17.38&lon=78.49", headers=auth)
        assert response.status_code == 503
        assert response.json()["detail"] == (
            "The open-meteo data provider is temporarily unavailable. Please try again shortly."
        )

    def test_geocode_search_provider_failure_returns_503(self, client, auth, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("nominatim", "offline")

        monkeypatch.setattr(geocoding_service, "request_json", _down)
        response = client.get("/api/geocode/search?q=Chennai", headers=auth)
        assert response.status_code == 503
        assert "nominatim" in response.json()["detail"]

    def test_geocode_reverse_failure_falls_back_to_coordinates(self, client, auth, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("nominatim", "offline")

        monkeypatch.setattr(geocoding_service, "request_json", _down)
        response = client.get("/api/geocode/reverse?lat=17.385&lon=78.487", headers=auth)
        assert response.status_code == 200
        assert response.json()["places"][0]["name"] == "17.385, 78.487"

    @pytest.fixture
    def llm_provider_down(self, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("llm", "offline", 500)

        monkeypatch.setattr(ai_service, "request_json", _down)
        monkeypatch.setenv("LLM_API_KEY", "test-key")
        monkeypatch.setenv("LLM_MODEL", "test-model")
        monkeypatch.setenv("LLM_FALLBACK_MODELS", "")
        ai_service.reset_breaker()
        get_settings.cache_clear()
        yield
        ai_service.reset_breaker()
        get_settings.cache_clear()

    def test_llm_provider_failure_degrades_to_grounded_answer(self, client, auth, llm_provider_down):
        response = client.post("/api/ai/chat", json={"message": "hello"}, headers=auth)
        assert response.status_code == 200
        body = response.json()
        assert body["degraded"] is True
        assert body["provider"] == "grounded-fallback"
        assert body["response"].strip()

    def test_ai_weather_enrichment_failure_does_not_break_chat(
        self, client, auth, llm_provider_down, monkeypatch
    ):
        async def _down(*_args, **_kwargs):
            raise ProviderError("open-meteo", "offline")

        monkeypatch.setattr(weather_service, "fetch_weather", _down)
        payload = {
            "message": "what is the weather like?",
            "location": {"name": "Test City", "latitude": 17.38, "longitude": 78.49},
        }
        response = client.post("/api/ai/chat", json=payload, headers=auth)
        assert response.status_code == 200
        assert response.json()["degraded"] is True

    def test_rag_store_failure_returns_400(self, client, auth, monkeypatch):
        def _down(*_args, **_kwargs):
            raise rag_service.RagStoreError("indexing failed")

        monkeypatch.setattr(rag_service, "process_document", _down)
        response = client.post(
            "/api/rag/upload",
            headers=auth,
            files={"file": ("report.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "indexing failed"}

    def test_rag_rejects_unsupported_extension(self, client, auth):
        response = client.post(
            "/api/rag/upload",
            headers=auth,
            files={"file": ("malware.exe", b"MZ", "application/octet-stream")},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Only PDF, CSV and TXT files are supported."

    def test_rag_upload_limit_returns_413(self, client, auth, monkeypatch):
        monkeypatch.setenv("MAX_UPLOAD_BYTES", "4")
        get_settings.cache_clear()
        response = client.post(
            "/api/rag/upload",
            headers=auth,
            files={"file": ("report.txt", b"12345", "text/plain")},
        )
        get_settings.cache_clear()
        assert response.status_code == 413
        assert response.json()["detail"] == "File exceeds the 0MB limit."

    def test_carbon_geocoding_failure_returns_400(self, client, auth, monkeypatch):
        async def _down(*_args, **_kwargs):
            raise ProviderError("nominatim", "offline")

        monkeypatch.setattr(carbon_service, "request_json", _down)
        response = client.post(
            "/api/carbon/estimate-distance",
            json={"origin": "A", "destination": "B"},
            headers=auth,
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Could not resolve one or both locations. Try a more specific name."

        calculated = client.post(
            "/api/carbon/calculate",
            json={"origin": "A", "destination": "B"},
            headers=auth,
        )
        assert calculated.status_code == 400
        assert "Distance required" in calculated.json()["detail"]
