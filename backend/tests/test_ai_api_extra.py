"""Additional assistant-route coverage: enrichment fallbacks and routing branches."""

from __future__ import annotations

import anyio
import pytest
from fastapi.testclient import TestClient

import api.ai as ai_api
from config import get_settings
from http_client import ProviderError
from services import ai_service, air_quality_service, rag_service, weather_service

LLMCall = tuple[str, str, list[dict[str, object]]]


def _location() -> dict[str, object]:
    return {
        "name": "Gudur",
        "region": "Andhra Pradesh",
        "country": "India",
        "latitude": 17.38,
        "longitude": 78.49,
    }


def _aqi_payload() -> dict[str, object]:
    return {
        "aqi": 142,
        "status": "Unhealthy for Sensitive Groups",
        "dominantPollutant": "PM2.5",
        "healthAdvisory": "Limit prolonged outdoor exertion.",
        "location": _location(),
        "pollutants": [{"name": "PM2.5", "value": 55.0, "unit": "µg/m³", "status": "High"}],
        "timestamp": "2026-01-01T00:00:00Z",
        "source": "open-meteo-air",
        "isEstimated": False,
    }


def _forecast_rows() -> list[dict[str, object]]:
    return [
        {"label": f"T+{hours}h", "aqi": 100 + hours, "dominantPollutant": "PM2.5", "timeOffsetHours": hours}
        for hours in (24, 48)
    ]


def _weather_payload() -> dict[str, object]:
    return {
        "current": {
            "temperature": 31.0,
            "feelsLike": 35.0,
            "humidity": 60,
            "windSpeed": 12.0,
            "windDirection": 200,
            "cloudCover": 20,
            "precipitation": 0.0,
            "pressure": 1010.0,
            "uvIndex": 8.0,
            "visibility": 20000.0,
            "precipitationProbability": 10,
            "condition": "Clear sky",
            "observedAt": "2026-01-01T00:00:00Z",
        },
        "daily": [
            {
                "date": "2026-01-02",
                "condition": "Sunny",
                "temperatureMin": 22.0,
                "temperatureMax": 33.0,
                "precipitationProbabilityMax": 10,
                "precipitationSum": 0.0,
                "windSpeedMax": 15.0,
            }
        ],
        "source": "open-meteo",
    }


def _history_rows() -> list[dict[str, object]]:
    return [
        {"date": "2023-01-01", "aqiMean": 156, "dominantPollutant": "PM2.5"},
        {"date": "2023-02-01", "aqiMean": 121, "dominantPollutant": "PM2.5"},
    ]


def _patch_llm(monkeypatch: pytest.MonkeyPatch, result: dict[str, object] | None = None) -> list[LLMCall]:
    calls: list[LLMCall] = []

    async def generate(
        message: str, context_text: str, history: list[dict[str, object]] | None = None
    ) -> dict[str, object]:
        calls.append((message, context_text, history or []))
        if result is not None:
            return result
        return {"response": "fake answer", "provider": "fake"}

    monkeypatch.setattr(ai_service, "generate_response", generate)
    return calls


def _patch_aqi(monkeypatch: pytest.MonkeyPatch, calls: list[dict[str, object]]) -> None:
    async def get_air_quality(lat: float, lon: float, city: str | None = None) -> dict[str, object]:
        calls.append({"kind": "current", "lat": lat, "lon": lon, "city": city})
        return _aqi_payload()

    async def fetch_forecast(lat: float, lon: float, days: int = 5) -> list[dict[str, object]]:
        calls.append({"kind": "forecast", "lat": lat, "lon": lon, "days": days})
        return _forecast_rows()

    monkeypatch.setattr(air_quality_service, "get_air_quality", get_air_quality)
    monkeypatch.setattr(air_quality_service, "fetch_aqi_forecast", fetch_forecast)


def _patch_weather(monkeypatch: pytest.MonkeyPatch, calls: list[dict[str, object]]) -> None:
    async def fetch(lat: float, lon: float, forecast_days: int = 7) -> dict[str, object]:
        calls.append({"lat": lat, "lon": lon, "days": forecast_days})
        return _weather_payload()

    monkeypatch.setattr(weather_service, "fetch_weather", fetch)


def _forbid_aqi(monkeypatch: pytest.MonkeyPatch) -> None:
    async def forbidden(*args: object, **kwargs: object) -> object:
        raise AssertionError("an AQI provider call was not expected")

    monkeypatch.setattr(air_quality_service, "get_air_quality", forbidden)
    monkeypatch.setattr(air_quality_service, "fetch_aqi_forecast", forbidden)
    monkeypatch.setattr(air_quality_service, "fetch_aqi_history", forbidden)


def _forbid_weather(monkeypatch: pytest.MonkeyPatch) -> None:
    async def forbidden(*args: object, **kwargs: object) -> object:
        raise AssertionError("a weather provider call was not expected")

    monkeypatch.setattr(weather_service, "fetch_weather", forbidden)


def test_clean_location_normalizes_and_pairs_coordinates() -> None:
    assert ai_api._clean_location(None) == {}
    assert ai_api._clean_location({"latitude": 17.38}) == {}
    assert ai_api._clean_location({"longitude": 78.49}) == {}
    assert ai_api._clean_location({"name": 12, "latitude": 200, "longitude": "78.49"}) == {}

    assert ai_api._clean_location({"name": "  Gudur  ", "region": " AP ", "country": " India "}) == {
        "name": "Gudur",
        "region": "AP",
        "country": "India",
    }

    cleaned = ai_api._clean_location(
        {
            "name": "x" * 250,
            "region": "y" * 130,
            "country": "z" * 130,
            "latitude": 17.381,
            "longitude": 78.489,
        }
    )
    assert cleaned["name"] == "x" * 200
    assert cleaned["region"] == "y" * 120
    assert cleaned["country"] == "z" * 120
    assert cleaned["latitude"] == 17.381
    assert cleaned["longitude"] == 78.489


def test_needs_documents_triggers_on_attachments_and_wording() -> None:
    assert ai_api._needs_documents("hello", None, "greeting") is False
    assert ai_api._needs_documents("hello", ["doc-1"], "greeting") is True
    assert ai_api._needs_documents("summarise this document", None, "documents") is True
    assert ai_api._needs_documents("compare that with today", None, "document_context") is True
    assert ai_api._needs_documents("what is the aqi here?", None, "air_quality") is False


def test_chat_without_enrichment_uses_client_weather_and_aqi(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    _forbid_aqi(monkeypatch)
    _forbid_weather(monkeypatch)

    response = client.post(
        "/api/ai/chat?enrich=false",
        headers=auth,
        json={
            "message": "weather and aqi",
            "location": _location(),
            "weather": _weather_payload(),
            "aqHistory": [
                {
                    "aqi": 111,
                    "status": "Unhealthy for Sensitive Groups",
                    "dominantPollutant": "PM2.5",
                    "timestamp": "2026-01-01T00:00:00Z",
                    "location": "Gudur",
                }
            ],
            "history": [{"role": "user", "content": "earlier question"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    latency = body.pop("latencyMs")
    assert isinstance(latency, int)
    assert latency >= 0
    sections = body.pop("contextSections")
    assert body == {
        "response": "fake answer",
        "contextUsed": False,
        "intent": "combined",
        "provider": "fake",
        "degraded": False,
        "dataCoverage": {
            "air_quality": True,
            "weather": True,
            "aqi_forecast": False,
            "carbon": False,
            "documents": False,
            "location": True,
            "household": False,
            "aqi_history": True,
        },
    }
    assert "AQI 111" in calls[0][1]
    assert "temperature 31°C" in calls[0][1]
    assert calls[0][2] == [{"role": "user", "content": "earlier question"}]
    assert sections[0] == "SELECTED LOCATION: Gudur"
    assert any(section.startswith("WEATHER (now)") for section in sections)


def test_chat_enriches_air_quality_only_and_caches_it(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    provider_calls: list[dict[str, object]] = []
    _patch_aqi(monkeypatch, provider_calls)
    _forbid_weather(monkeypatch)
    payload = {"message": "what is the aqi here?", "location": _location()}

    first = client.post("/api/ai/chat", headers=auth, json=payload)
    second = client.post("/api/ai/chat", headers=auth, json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json()["intent"] == "air_quality"
    assert "AQI 142" in calls[0][1]
    assert "provider: open-meteo-air" in calls[0][1]
    assert provider_calls == [
        {"kind": "current", "lat": 17.38, "lon": 78.49, "city": None},
        {"kind": "forecast", "lat": 17.38, "lon": 78.49, "days": 5},
    ]
    assert first.json()["dataCoverage"]["aqi_forecast"] is True
    assert first.json()["dataCoverage"]["weather"] is False


def test_chat_enriches_weather_only(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    _forbid_aqi(monkeypatch)
    provider_calls: list[dict[str, object]] = []
    _patch_weather(monkeypatch, provider_calls)

    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={"message": "will it rain tomorrow?", "location": _location()},
    )

    assert response.status_code == 200
    assert response.json()["intent"] == "rain"
    assert "temperature 31°C" in calls[0][1]
    assert "2026-01-02" in calls[0][1]
    assert provider_calls == [{"lat": 17.38, "lon": 78.49, "days": 3}]
    assert response.json()["dataCoverage"]["weather"] is True
    assert response.json()["dataCoverage"]["air_quality"] is False


def test_weather_provider_error_is_tolerated(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    _forbid_aqi(monkeypatch)

    async def broken(lat: float, lon: float, forecast_days: int = 7) -> dict[str, object]:
        raise ProviderError("open-meteo", "connection refused")

    monkeypatch.setattr(weather_service, "fetch_weather", broken)

    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={"message": "how is the weather?", "location": _location()},
    )

    assert response.status_code == 200
    assert "WEATHER (now): unavailable" in calls[0][1]
    assert "WEATHER (forecast): unavailable" in calls[0][1]
    assert response.json()["dataCoverage"]["weather"] is False


def test_air_quality_provider_error_is_reported(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)

    async def broken(lat: float, lon: float, city: str | None = None) -> dict[str, object]:
        raise ProviderError("air-test", "connection refused")

    async def forecast(lat: float, lon: float, days: int = 5) -> list[dict[str, object]]:
        return []

    monkeypatch.setattr(air_quality_service, "get_air_quality", broken)
    monkeypatch.setattr(air_quality_service, "fetch_aqi_forecast", forecast)
    _forbid_weather(monkeypatch)

    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={"message": "how bad is the pollution?", "location": _location()},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The air-test data provider is temporarily unavailable. Please try again shortly."
    }
    assert calls == []


def test_historical_question_uses_provider_history(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    provider_calls: list[dict[str, object]] = []
    _patch_aqi(monkeypatch, provider_calls)
    _forbid_weather(monkeypatch)
    history_calls: list[dict[str, object]] = []

    async def history(lat: float, lon: float, start: str, end: str) -> list[dict[str, object]]:
        history_calls.append({"lat": lat, "lon": lon, "start": start, "end": end})
        return _history_rows()

    monkeypatch.setattr(air_quality_service, "fetch_aqi_history", history)

    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={"message": "how was the air in 2023?", "location": _location()},
    )

    assert response.status_code == 200
    assert response.json()["intent"] == "historical"
    assert "HISTORICAL AIR QUALITY" in calls[0][1]
    assert "2023" in calls[0][1]
    assert len(history_calls) == 1
    assert history_calls[0]["start"] == "2023-01-01"
    assert history_calls[0]["end"] == "2023-12-31"
    assert response.json()["dataCoverage"]["aqi_history"] is True


def test_history_provider_error_is_tolerated(monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken(lat: float, lon: float, start: str, end: str) -> list[dict[str, object]]:
        raise ProviderError("open-meteo-air", "history unavailable")

    monkeypatch.setattr(air_quality_service, "fetch_aqi_history", broken)

    rows, label = anyio.run(
        ai_api._load_history,
        {"latitude": 17.38, "longitude": 78.49},
        get_settings(),
        ("2023-01-01", "2023-12-31", "2023"),
    )

    assert rows is None
    assert label == "2023"


def test_summary_request_uses_document_overview(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    _forbid_aqi(monkeypatch)
    _forbid_weather(monkeypatch)
    overview_calls: list[tuple[str, list[str] | None, int]] = []

    def overview(uid: str, file_ids: list[str] | None, top_k: int) -> list[dict[str, object]]:
        overview_calls.append((uid, file_ids, top_k))
        return [{"chunk": "The report recommends indoor filtration.", "fileName": "air.txt", "score": 0.8}]

    def forbidden(*args: object, **kwargs: object) -> list[dict[str, object]]:
        raise AssertionError("retrieval was not expected for a summary question")

    monkeypatch.setattr(rag_service, "overview", overview)
    monkeypatch.setattr(rag_service, "retrieve", forbidden)

    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={"message": "summarise this document"},
    )

    assert response.status_code == 200
    assert response.json()["contextUsed"] is True
    assert response.json()["intent"] == "documents"
    assert response.json()["dataCoverage"]["documents"] is True
    assert "The report recommends indoor filtration." in calls[0][1]
    assert overview_calls == [("test-user", None, 4)]


def test_attached_document_uses_retrieval(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    _forbid_aqi(monkeypatch)
    provider_calls: list[dict[str, object]] = []
    _patch_weather(monkeypatch, provider_calls)
    retrieval_calls: list[tuple[str, str, int, list[str] | None]] = []

    def retrieve(uid: str, query: str, top_k: int, file_ids: list[str] | None) -> list[dict[str, object]]:
        retrieval_calls.append((uid, query, top_k, file_ids))
        return [{"chunk": "Yesterday's readings peaked at 190.", "fileName": "report.pdf", "score": 0.7}]

    def forbidden(*args: object, **kwargs: object) -> list[dict[str, object]]:
        raise AssertionError("overview was not expected for a comparison question")

    monkeypatch.setattr(rag_service, "retrieve", retrieve)
    monkeypatch.setattr(rag_service, "overview", forbidden)

    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={
            "message": "compare that with today",
            "location": _location(),
            "documentIds": ["doc-1"],
        },
    )

    assert response.status_code == 200
    assert response.json()["contextUsed"] is True
    assert response.json()["dataCoverage"]["documents"] is True
    assert "Yesterday's readings peaked at 190." not in calls[0][1]
    assert not any(
        section.startswith("RETRIEVED USER DOCUMENTS") for section in response.json()["contextSections"]
    )
    assert retrieval_calls == [("test-user", "compare that with today", 4, ["doc-1"])]
    assert provider_calls == [{"lat": 17.38, "lon": 78.49, "days": 3}]


def test_document_context_combines_retrieval_with_live_readings(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_llm(monkeypatch)
    aqi_calls: list[dict[str, object]] = []
    _patch_aqi(monkeypatch, aqi_calls)
    weather_calls: list[dict[str, object]] = []
    _patch_weather(monkeypatch, weather_calls)
    retrieval_calls: list[tuple[str, str, int, list[str] | None]] = []

    def retrieve(uid: str, query: str, top_k: int, file_ids: list[str] | None) -> list[dict[str, object]]:
        retrieval_calls.append((uid, query, top_k, file_ids))
        return [{"chunk": "The report recorded a peak of 190 yesterday.", "fileName": "report.pdf"}]

    def forbidden(*args: object, **kwargs: object) -> list[dict[str, object]]:
        raise AssertionError("overview was not expected for a comparison question")

    monkeypatch.setattr(rag_service, "retrieve", retrieve)
    monkeypatch.setattr(rag_service, "overview", forbidden)

    message = "compare the report with current air quality"
    response = client.post(
        "/api/ai/chat",
        headers=auth,
        json={"message": message, "location": _location(), "documentIds": ["doc-1"]},
    )

    assert response.status_code == 200
    assert response.json()["intent"] == "document_context"
    assert "The report recorded a peak of 190 yesterday." in calls[0][1]
    assert "AQI 142" in calls[0][1]
    assert "temperature 31°C" in calls[0][1]
    assert retrieval_calls == [("test-user", message, 4, ["doc-1"])]
    assert len(aqi_calls) == 2
    assert len(weather_calls) == 1


def test_token_usage_and_missing_provider_defaults(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_llm(
        monkeypatch,
        {"response": "brief answer", "prompt_tokens": 9, "completion_tokens": 4, "degraded": True},
    )
    _forbid_aqi(monkeypatch)
    _forbid_weather(monkeypatch)

    response = client.post("/api/ai/chat", headers=auth, json={"message": "hello there"})

    assert response.status_code == 200
    body = response.json()
    body.pop("latencyMs")
    assert body["response"] == "brief answer"
    assert body["provider"] == "unknown"
    assert body["degraded"] is True
    assert body["intent"] == "greeting"


def test_message_validation_rejects_control_characters(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post("/api/ai/chat", headers=auth, json={"message": "\x00"})

    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "Invalid request."
    assert any(problem["field"].endswith("message") for problem in body["problems"])
    assert "\x00" not in response.text


def test_missing_authentication_is_rejected(client: TestClient) -> None:
    response = client.post("/api/ai/chat", json={"message": "hello there"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing authentication token"}
