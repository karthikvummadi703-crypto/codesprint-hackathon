from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from api import ai as ai_router
from api import air as air_router
from api import carbon as carbon_router
from api import deps
from api import geocode as geocode_router
from api import rag as rag_router
from api import weather as weather_router
from errors import AppError, NotFoundError
from http_client import ProviderError
from schemas import CarbonRequest, ChatRequest, DistanceRequest
from services import air_quality_service, rag_service, weather_service
from services import query_router as qr

FROZEN_NOW = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)

LOCATION = {
    "name": "Gudur",
    "latitude": 14.1489,
    "longitude": 79.8530,
    "region": "Andhra Pradesh",
    "country": "India",
    "source": "coordinates",
}

POLLUTANTS = [
    {
        "id": "pm25",
        "name": "PM2.5",
        "value": 55.0,
        "unit": "ug/m3",
        "status": "High",
        "description": "Fine particulate matter",
        "safeLimit": 35.0,
        "subIndex": 142,
    }
]


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return FROZEN_NOW.replace(tzinfo=None)
        return FROZEN_NOW.astimezone(tz)


class FakeCache:
    def __init__(self):
        self.store = {}
        self.calls = []

    async def get_or_set(self, key, ttl_s, factory):
        self.calls.append((key, ttl_s))
        if key in self.store:
            return self.store[key]
        value = await factory()
        self.store[key] = value
        return value


class FakeUpload:
    def __init__(self, filename, data):
        self.filename = filename
        self._data = data
        self._offset = 0

    async def read(self, size=-1):
        if size is None or size < 0:
            chunk = self._data[self._offset :]
            self._offset = len(self._data)
            return chunk
        chunk = self._data[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk


@pytest.fixture
def router_settings(monkeypatch):
    settings = SimpleNamespace(
        cache_max_entries=64,
        cache_ttl_aqi_s=60,
        cache_ttl_weather_s=120,
        cache_ttl_geocode_s=300,
        max_upload_bytes=1024,
        http_timeout_s=5.0,
        http_max_retries=1,
        nominatim_user_agent="test-agent/1.0",
        allow_dev_auth=True,
        environment="test",
        rate_limit_enabled=False,
    )
    for module in (ai_router, air_router, geocode_router, rag_router, weather_router):
        monkeypatch.setattr(module, "get_settings", lambda: settings)
    return settings


@pytest.fixture
def cache(monkeypatch):
    fake = FakeCache()
    for module in (ai_router, air_router, geocode_router, weather_router):
        monkeypatch.setattr(module, "env_cache", fake)
    monkeypatch.setattr(deps, "env_cache", fake)
    return fake


@pytest.fixture
def frozen_clock(monkeypatch):
    for module in (air_router, weather_router, qr):
        monkeypatch.setattr(module, "datetime", FrozenDatetime)
    return FROZEN_NOW


@pytest.fixture
def inline_threads(monkeypatch):
    import anyio

    async def run_sync(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(anyio.to_thread, "run_sync", run_sync)
    return run_sync


@pytest.fixture
def resolve_location(monkeypatch):
    calls = []

    async def fake(lat=None, lon=None, city=None, **kwargs):
        calls.append((lat, lon, city, kwargs))
        return dict(LOCATION), "coordinates"

    monkeypatch.setattr(air_quality_service, "resolve_location", fake)
    return calls


def aqi_payload(aqi=142):
    return {
        "aqi": aqi,
        "status": "Unhealthy for Sensitive Groups",
        "dominantPollutant": "pm25",
        "healthAdvisory": "Limit prolonged outdoor activity.",
        "location": dict(LOCATION),
        "pollutants": [dict(POLLUTANTS[0])],
        "timestamp": "2026-06-01T12:00:00Z",
        "change24h": 5,
        "historical": [],
        "source": "open-meteo-air",
        "isEstimated": False,
        "forecastAvailable": True,
    }


def history_day(day="2026-05-31", aqi=118):
    return {
        "date": day,
        "aqiMean": aqi,
        "aqiMax": aqi + 20,
        "aqiMin": aqi - 20,
        "dominant": "PM2.5",
        "pm25": 40.0,
        "pm10": 70.0,
    }


def forecast_point(offset_hours=0, aqi=110):
    stamp = FROZEN_NOW + timedelta(hours=offset_hours)
    return {
        "timestamp": stamp.isoformat().replace("+00:00", "Z"),
        "aqi": aqi,
        "pm25": 30.0,
        "pm10": 55.0,
        "no2": 20.0,
        "so2": 8.0,
        "co": 400.0,
        "o3": 25.0,
        "dominant": "pm25",
    }


def weather_payload(hours=3):
    return {
        "current": {
            "temperature": 31.0,
            "feelsLike": 35.0,
            "humidity": 60,
            "windSpeed": 14.0,
            "windDirection": 200,
            "precipitation": 0.0,
            "cloudCover": 20,
            "pressure": 1008.0,
            "uvIndex": 8.0,
            "visibility": 20000.0,
            "isDay": True,
            "condition": "Partly cloudy",
            "conditionCode": 2,
            "observedAt": "2026-06-01T12:00:00Z",
        },
        "hourly": [
            {
                "timestamp": f"2026-06-01T{index:02d}:00:00Z",
                "temperature": 30.0 + index,
                "apparentTemperature": 34.0 + index,
                "humidity": 60,
                "precipitation": 0.0,
                "precipitationProbability": 10,
                "windSpeed": 12.0,
                "windDirection": 200,
                "cloudCover": 20,
                "condition": "Clear sky",
                "conditionCode": 0,
                "uvIndex": 7.0,
            }
            for index in range(hours)
        ],
        "daily": [
            {
                "date": "2026-06-01",
                "condition": "Partly cloudy",
                "conditionCode": 2,
                "temperatureMax": 34.0,
                "temperatureMin": 24.0,
                "precipitationSum": 0.0,
                "precipitationProbabilityMax": 10,
                "windSpeedMax": 18.0,
                "windDirectionDominant": 200,
                "uvIndexMax": 9.0,
                "sunrise": "2026-06-01T00:30:00Z",
                "sunset": "2026-06-01T12:30:00Z",
            }
        ],
        "units": {"temperature": "C"},
        "source": "open-meteo",
        "timestamp": "2026-06-01T12:00:00Z",
    }


class TestCarbonRoutes:
    async def test_estimate_distance_success(self, monkeypatch):
        seen = []

        async def fake(origin, destination):
            seen.append((origin, destination))
            return 123.45

        monkeypatch.setattr(carbon_router.carbon_service, "estimate_distance", fake)

        result = await carbon_router.estimate_distance("u", DistanceRequest(origin="A", destination="B"))

        assert result.distanceKm == 123.45
        assert seen == [("A", "B")]

    async def test_estimate_distance_unresolvable_raises_app_error(self, monkeypatch):
        async def fake(origin, destination):
            return None

        monkeypatch.setattr(carbon_router.carbon_service, "estimate_distance", fake)

        with pytest.raises(AppError) as exc:
            await carbon_router.estimate_distance("u", DistanceRequest(origin="A", destination="B"))

        assert "Could not resolve" in exc.value.message

    async def test_calculate_delegates_to_service(self, monkeypatch):
        seen = {}

        async def fake(origin, destination, distance_km, mode):
            seen.update(origin=origin, destination=destination, distance_km=distance_km, mode=mode)
            return {"co2eKg": 1.23}

        monkeypatch.setattr(carbon_router.carbon_service, "calculate_carbon", fake)
        payload = CarbonRequest(origin="A", destination="B", distanceKm=10, mode="Train")

        assert await carbon_router.calculate("u", payload) == {"co2eKg": 1.23}
        assert seen == {"origin": "A", "destination": "B", "distance_km": 10.0, "mode": "Train"}

    async def test_calculate_value_error_becomes_app_error(self, monkeypatch):
        async def fake(*args):
            raise ValueError("Distance required")

        monkeypatch.setattr(carbon_router.carbon_service, "calculate_carbon", fake)

        with pytest.raises(AppError, match="Distance required"):
            await carbon_router.calculate(
                "u", CarbonRequest(origin="A", destination="B", distanceKm=10)
            )


class TestGeocodeRoutes:
    async def test_search_trims_query_and_uses_namespaced_cache(self, monkeypatch, cache):
        seen = []

        async def fake(query, limit):
            seen.append((query, limit))
            return [{"name": "Chennai", "latitude": 13.08, "longitude": 80.27, "label": "Chennai, India"}]

        monkeypatch.setattr(geocode_router.geocoding_service, "search_places", fake)

        result = await geocode_router.search("u", "  Chennai  ", 5)

        assert result.places[0].name == "Chennai"
        assert result.places[0].label == "Chennai, India"
        assert seen == [("Chennai", 5)]
        assert cache.calls[0][0] == "geocode:search:chennai:5"

    async def test_reverse_wraps_single_place(self, monkeypatch, cache):
        seen = []

        async def fake(lat, lon):
            seen.append((lat, lon))
            return {"name": "17.380, 78.490", "latitude": lat, "longitude": lon}

        monkeypatch.setattr(geocode_router.geocoding_service, "safe_reverse_geocode", fake)

        result = await geocode_router.reverse("u", 17.38, 78.49)

        assert result.places[0].name == "17.380, 78.490"
        assert seen == [(17.38, 78.49)]
        assert cache.calls[0][0] == "geocode:reverse:17.380,78.490"


class TestWeatherRoutes:
    async def test_get_weather_truncates_copy_without_mutating_cache(
        self, monkeypatch, cache, frozen_clock, resolve_location
    ):
        payload = weather_payload(hours=3)
        seen = []

        async def fake(lat, lon, forecast_days):
            seen.append((lat, lon, forecast_days))
            return payload

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", fake)

        result = await weather_router.get_weather(
            "u", {"lat": 14.1489, "lon": 79.8530, "city": "Ignored"}, days=7, hours=2
        )

        assert len(result.hourly) == 2
        assert len(cache.store["weather-full:14.15,79.85:7:2"]["hourly"]) == 3
        assert result.location.name == "Gudur"
        assert seen == [(14.1489, 79.8530, 7)]
        assert resolve_location == [(14.1489, 79.8530, None, {})]
        assert result.timestamp.endswith("Z")

    async def test_get_weather_city_fallback_uses_resolved_coordinates(
        self, monkeypatch, cache, frozen_clock, resolve_location
    ):
        async def fake(lat, lon, forecast_days):
            return weather_payload(hours=1)

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", fake)

        result = await weather_router.get_weather("u", {"lat": None, "lon": None, "city": "Gudur"})

        assert resolve_location == [(None, None, "Gudur", {})]
        assert any(key.startswith("weather-full:14.15,79.85") for key in cache.store)
        assert result.current.temperature == 31.0

    async def test_summary_uses_provider_source_and_truncates_daily(
        self, monkeypatch, cache, frozen_clock, resolve_location
    ):
        payload = weather_payload(hours=2)
        payload["source"] = "custom-provider"

        async def fake(lat, lon, forecast_days):
            assert forecast_days == 2
            return payload

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", fake)

        result = await weather_router.get_weather_summary(
            "u", {"lat": 14.1489, "lon": 79.8530, "city": None}, days=2
        )

        assert result["source"] == "custom-provider"
        assert len(result["daily"]) == 1
        assert result["location"]["name"] == "Gudur"
        assert result["timestamp"].startswith("2026-06-01T12:00:00")

    async def test_summary_falls_back_to_declared_source(self, monkeypatch, cache, frozen_clock, resolve_location):
        payload = weather_payload(hours=1)
        payload.pop("source")

        async def fake(lat, lon, forecast_days):
            return payload

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", fake)

        result = await weather_router.get_weather_summary(
            "u", {"lat": 14.1489, "lon": 79.8530, "city": None}, days=3
        )

        assert result["source"] == weather_router.weather_service.SOURCE

    async def test_summary_city_fallback_uses_resolved_coordinates(
        self, monkeypatch, cache, frozen_clock, resolve_location
    ):
        async def fake(lat, lon, forecast_days):
            return weather_payload(hours=1)

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", fake)

        result = await weather_router.get_weather_summary(
            "u", {"lat": None, "lon": None, "city": "Gudur"}, days=3
        )

        assert resolve_location == [(None, None, "Gudur", {})]
        assert any(key.startswith("weather-summary:14.15,79.85") for key in cache.store)
        assert result["location"]["name"] == "Gudur"


class TestAirRoutes:
    async def test_get_aqi_uses_coordinate_cache(self, monkeypatch, cache):
        seen = []

        async def fake(lat=None, lon=None, city=None):
            seen.append((lat, lon, city))
            return aqi_payload()

        monkeypatch.setattr(air_router.air_quality_service, "get_air_quality", fake)

        result = await air_router.get_aqi("u", {"lat": 17.38, "lon": 78.49, "city": None})

        assert result.aqi == 142
        assert result.change24h == 5
        assert seen == [(17.38, 78.49, None)]
        assert cache.calls[0][0] == "aqi:17.38,78.49"

    async def test_get_aqi_city_path_bypasses_cache(self, monkeypatch, cache):
        seen = []

        async def fake(lat=None, lon=None, city=None):
            seen.append((lat, lon, city))
            return aqi_payload(aqi=88)

        monkeypatch.setattr(air_router.air_quality_service, "get_air_quality", fake)

        result = await air_router.get_aqi("u", {"lat": None, "lon": None, "city": "Gudur"})

        assert result.aqi == 88
        assert seen == [(None, None, "Gudur")]
        assert cache.calls == []

    async def test_history_fetch_and_response(self, monkeypatch, cache, frozen_clock, resolve_location):
        seen = []

        async def fake(lat, lon, start, end):
            seen.append((lat, lon, start, end))
            return [history_day()]

        monkeypatch.setattr(air_router.air_quality_service, "fetch_aqi_history", fake)

        result = await air_router.get_aqi_history(
            "u",
            {"lat": 14.1489, "lon": 79.8530, "city": None},
            start=date(2026, 5, 30),
            end=date(2026, 5, 31),
        )

        assert result.startDate == "2026-05-30"
        assert result.endDate == "2026-05-31"
        assert result.points[0].aqiMean == 118
        assert result.source == "open-meteo-air"
        assert result.timestamp.startswith("2026-06-01T12:00:00")
        assert seen == [(14.1489, 79.8530, "2026-05-30", "2026-05-31")]

    async def test_history_clamps_long_range_to_366_days(
        self, monkeypatch, cache, frozen_clock, resolve_location
    ):
        seen = []

        async def fake(lat, lon, start, end):
            seen.append((lat, lon, start, end))
            return []

        monkeypatch.setattr(air_router.air_quality_service, "fetch_aqi_history", fake)

        result = await air_router.get_aqi_history(
            "u",
            {"lat": 14.1489, "lon": 79.8530, "city": None},
            start=date(2020, 1, 1),
            end=date(2026, 6, 1),
        )

        expected_start = (frozen_clock.date() - timedelta(days=366)).isoformat()
        assert result.startDate == expected_start
        assert result.endDate == "2026-06-01"
        assert seen[0][2] == expected_start

    async def test_history_rejects_reversed_range(self, frozen_clock):
        with pytest.raises(AppError, match="start must be on or before end"):
            await air_router.get_aqi_history(
                "u",
                {"lat": 14.1489, "lon": 79.8530, "city": None},
                start=date(2026, 6, 2),
                end=date(2026, 6, 1),
            )

    async def test_predictions_prefer_provider_forecast(
        self, monkeypatch, cache, frozen_clock, resolve_location
    ):
        offsets = air_router.FORECAST_OFFSETS

        async def fake_forecast(lat, lon, days):
            assert days == 5
            return [forecast_point(offset, 100 + offset) for offset in offsets]

        async def fail_current(*args, **kwargs):
            raise AssertionError("current reading should not be fetched")

        monkeypatch.setattr(air_router.air_quality_service, "fetch_aqi_forecast", fake_forecast)
        monkeypatch.setattr(air_router.air_quality_service, "get_air_quality", fail_current)

        result = await air_router.get_predictions(
            "u", {"lat": 14.1489, "lon": 79.8530, "city": None}, days=5
        )

        assert result.method == "provider-forecast"
        assert result.source == "open-meteo-air"
        assert result.horizonHours == 24
        assert [point.timeOffsetHours for point in result.predictions] == offsets
        assert result.predictions[-1].aqi == 124
        assert result.predictions[0].status in {
            "Good",
            "Moderate",
            "Unhealthy for Sensitive Groups",
            "Unhealthy",
            "Very Unhealthy",
            "Hazardous",
        }

    async def test_build_predictions_falls_back_to_heuristic(self, monkeypatch, frozen_clock):
        async def empty_forecast(lat, lon, days):
            return []

        async def current(lat=None, lon=None):
            return aqi_payload(aqi=160)

        monkeypatch.setattr(air_router.air_quality_service, "fetch_aqi_forecast", empty_forecast)
        monkeypatch.setattr(air_router.air_quality_service, "get_air_quality", current)

        result = await air_router._build_predictions(
            14.1489, 79.8530, dict(LOCATION), days=5
        )

        assert result["method"] == "heuristic-prototype"
        assert result["source"] == "heuristic"
        assert len(result["predictions"]) == 5
        assert result["predictions"][0]["aqi"] >= 15
        assert result["predictions"][0]["dominantPollutant"]

    async def test_from_provider_skips_points_far_from_requested_horizon(self, frozen_clock):
        assert air_router._from_provider([forecast_point(100)], frozen_clock) == []

    async def test_nearest_hour_ignores_invalid_timestamp(self, frozen_clock):
        point = forecast_point()
        point["timestamp"] = "not-a-date"

        assert air_router._nearest_hour([point], 0, frozen_clock) is None

    async def test_nearest_hour_treats_naive_timestamp_as_utc(self, frozen_clock):
        point = forecast_point()
        point["timestamp"] = "2026-06-01T12:00:00"

        assert air_router._nearest_hour([point], 0, frozen_clock) is point

    async def test_heuristic_forecast_uses_default_value_for_unknown_pollutant(self, frozen_clock):
        forecasts = air_router._heuristic_forecast(100, [], frozen_clock)

        assert len(forecasts) == 5
        assert forecasts[0]["pm25"] > 0
        assert forecasts[0]["status"]


class TestRagRoutes:
    async def test_upload_success(self, monkeypatch, router_settings, inline_threads):
        seen = {}

        def process(uid, filename, data):
            seen.update(uid=uid, filename=filename, data=data)
            return {
                "fileId": "f1",
                "fileName": filename,
                "chunkCount": 1,
                "textPreview": data.decode(),
            }

        monkeypatch.setattr(rag_router.rag_service, "process_document", process)

        result = await rag_router.upload("u", FakeUpload("report.txt", b"hello"))

        assert result.fileId == "f1"
        assert result.textPreview == "hello"
        assert seen == {"uid": "u", "filename": "report.txt", "data": b"hello"}

    async def test_upload_rejects_unsupported_extension(self, router_settings):
        with pytest.raises(AppError, match="Only PDF, CSV and TXT"):
            await rag_router.upload("u", FakeUpload("malware.exe", b"MZ"))

    async def test_upload_rejects_oversized_file(self, router_settings):
        router_settings.max_upload_bytes = 4

        with pytest.raises(AppError) as exc:
            await rag_router.upload("u", FakeUpload("report.txt", b"12345"))

        assert exc.value.status_code == 413
        assert "limit" in exc.value.message

    async def test_upload_rejects_empty_file(self, router_settings):
        with pytest.raises(AppError, match="empty"):
            await rag_router.upload("u", FakeUpload("report.txt", b""))

    async def test_upload_wraps_store_error(self, monkeypatch, router_settings, inline_threads):
        def boom(*args):
            raise rag_service.RagStoreError("indexing failed")

        monkeypatch.setattr(rag_router.rag_service, "process_document", boom)

        with pytest.raises(AppError, match="indexing failed"):
            await rag_router.upload("u", FakeUpload("report.txt", b"hello"))

    async def test_list_files(self, monkeypatch, inline_threads):
        monkeypatch.setattr(
            rag_router.rag_service,
            "list_documents",
            lambda uid: [{"fileId": "f1", "fileName": "a.txt", "chunkCount": 2}],
        )

        result = await rag_router.list_files("u")

        assert result.files[0].fileId == "f1"
        assert result.files[0].chunkCount == 2

    async def test_delete_file_success(self, monkeypatch, inline_threads):
        seen = []

        def delete(uid, file_id):
            seen.append((uid, file_id))
            return True

        monkeypatch.setattr(rag_router.rag_service, "delete_document", delete)

        assert await rag_router.delete_file("u", "f1") == {"status": "deleted", "fileId": "f1"}
        assert seen == [("u", "f1")]

    @pytest.mark.parametrize("file_id", ["a/b", "a\\b", "x" * 129])
    async def test_delete_file_rejects_invalid_id(self, file_id, inline_threads):
        with pytest.raises(AppError, match="Invalid file identifier"):
            await rag_router.delete_file("u", file_id)

    async def test_delete_file_not_found(self, monkeypatch, inline_threads):
        monkeypatch.setattr(rag_router.rag_service, "delete_document", lambda uid, file_id: False)

        with pytest.raises(NotFoundError, match="File not found"):
            await rag_router.delete_file("u", "missing")


class TestAiHelpers:
    def test_clean_location_normalizes_and_drops_lone_coordinate(self):
        raw = {
            "name": "  Gudur  ",
            "latitude": 14.1489,
            "longitude": 79.853,
            "region": "  Andhra Pradesh ",
            "country": "India",
            "extra": "ignored",
        }

        assert ai_router._clean_location(raw) == {
            "name": "Gudur",
            "latitude": 14.1489,
            "longitude": 79.853,
            "region": "Andhra Pradesh",
            "country": "India",
        }
        assert ai_router._clean_location(None) == {}
        assert ai_router._clean_location({"latitude": 14.1489}) == {}
        assert ai_router._clean_location({"longitude": 79.853}) == {}
        assert ai_router._clean_location({"latitude": 999, "longitude": 79.853}) == {}

    @pytest.mark.parametrize(
        ("message", "document_ids", "intent", "expected"),
        [
            ("hello", None, "greeting", False),
            ("summarise this document", None, "general", True),
            ("what does it say?", None, "general", True),
            ("compare that with today", ["f1"], "general", True),
        ],
    )
    def test_needs_documents(self, message, document_ids, intent, expected):
        assert ai_router._needs_documents(message, document_ids, intent) is expected

    async def test_retrieve_documents_uses_overview_for_summary(self, monkeypatch, inline_threads):
        seen = {}

        def overview(uid, file_ids, top_k):
            seen.update(uid=uid, file_ids=file_ids, top_k=top_k)
            return [{"chunk": "overview"}]

        monkeypatch.setattr(rag_service, "overview", overview)

        assert await ai_router._retrieve_documents("u", "summarise the report", ["f1"]) == [{"chunk": "overview"}]
        assert seen == {"uid": "u", "file_ids": ["f1"], "top_k": 4}

    async def test_retrieve_documents_uses_relevance_for_questions(self, monkeypatch, inline_threads):
        seen = {}

        def retrieve(uid, message, top_k, file_ids):
            seen.update(uid=uid, message=message, top_k=top_k, file_ids=file_ids)
            return [{"chunk": "match"}]

        monkeypatch.setattr(rag_service, "retrieve", retrieve)

        assert await ai_router._retrieve_documents("u", "what is the pm25 level?", None) == [{"chunk": "match"}]
        assert seen == {
            "uid": "u",
            "message": "what is the pm25 level?",
            "top_k": 4,
            "file_ids": None,
        }

    async def test_load_air_quality_fetches_aqi_and_forecast(self, monkeypatch, cache):
        async def aqi(lat, lon):
            assert (lat, lon) == (14.1489, 79.853)
            return aqi_payload()

        async def forecast(lat, lon, days):
            assert days == 5
            return [forecast_point()]

        monkeypatch.setattr(air_quality_service, "get_air_quality", aqi)
        monkeypatch.setattr(air_quality_service, "fetch_aqi_forecast", forecast)

        result = await ai_router._load_air_quality(
            {"latitude": 14.1489, "longitude": 79.853}, SimpleNamespace(cache_ttl_aqi_s=60)
        )

        assert result[0]["aqi"] == 142
        assert len(result[1]) == 1
        assert any(key.startswith("ai-aqi-forecast:") for key in cache.store)

    async def test_load_air_quality_empty_forecast_becomes_none(self, monkeypatch, cache):
        async def aqi(lat, lon):
            return aqi_payload()

        async def forecast(lat, lon, days):
            return None

        monkeypatch.setattr(air_quality_service, "get_air_quality", aqi)
        monkeypatch.setattr(air_quality_service, "fetch_aqi_forecast", forecast)

        result = await ai_router._load_air_quality(
            {"latitude": 14.1489, "longitude": 79.853}, SimpleNamespace(cache_ttl_aqi_s=60)
        )

        assert result[1] is None

    async def test_load_history_returns_rows_and_label(self, monkeypatch, cache):
        seen = []

        async def fetch(lat, lon, start, end):
            seen.append((lat, lon, start, end))
            return [history_day()]

        monkeypatch.setattr(air_quality_service, "fetch_aqi_history", fetch)

        result = await ai_router._load_history(
            {"latitude": 14.1489, "longitude": 79.853},
            SimpleNamespace(cache_ttl_geocode_s=60),
            ("2026-05-01", "2026-05-31", "May 2026"),
        )

        assert result[0][0]["aqiMean"] == 118
        assert result[1] == "May 2026"
        assert seen == [(14.1489, 79.853, "2026-05-01", "2026-05-31")]

    async def test_load_history_provider_error_is_nonfatal(self, monkeypatch, cache):
        async def fetch(lat, lon, start, end):
            raise ProviderError("open-meteo-air", "offline")

        monkeypatch.setattr(air_quality_service, "fetch_aqi_history", fetch)

        result = await ai_router._load_history(
            {"latitude": 14.1489, "longitude": 79.853},
            SimpleNamespace(cache_ttl_geocode_s=60),
            ("2023-01-01", "2023-12-31", "2023"),
        )

        assert result == (None, "2023")

    async def test_load_weather_returns_provider_payload(self, monkeypatch, cache):
        async def fetch(lat, lon, forecast_days):
            assert forecast_days == 3
            return weather_payload(hours=2)

        monkeypatch.setattr(weather_service, "fetch_weather", fetch)

        result = await ai_router._load_weather(
            {"latitude": 14.1489, "longitude": 79.853}, SimpleNamespace(cache_ttl_weather_s=60)
        )

        assert result["current"]["temperature"] == 31.0
        assert any(key.startswith("ai-weather:") for key in cache.store)

    async def test_load_weather_provider_error_is_nonfatal(self, monkeypatch, cache):
        async def fetch(lat, lon, forecast_days):
            raise ProviderError("open-meteo", "offline")

        monkeypatch.setattr(weather_service, "fetch_weather", fetch)

        result = await ai_router._load_weather(
            {"latitude": 14.1489, "longitude": 79.853}, SimpleNamespace(cache_ttl_weather_s=60)
        )

        assert result is None

    async def test_no_enrichment_helpers(self):
        assert await ai_router._no_air_quality() == (None, None)
        assert await ai_router._no_weather() is None


@pytest.fixture
def chat_env(monkeypatch, router_settings):
    captured = {}
    generated = {}

    class FakeBuilder:
        def __init__(self, **kwargs):
            captured["kwargs"] = kwargs

        def build(self, message):
            captured["message"] = message
            return "CONTEXT", ["SECTION"], {"location": True}

    async def generate(message, context, history):
        generated.update(message=message, context=context, history=history)
        return {
            "response": "answer",
            "provider": "test-llm",
            "prompt_tokens": 10,
            "completion_tokens": 4,
        }

    monkeypatch.setattr(ai_router.ai_context, "ContextBuilder", FakeBuilder)
    monkeypatch.setattr(ai_router.ai_service, "generate_response", generate)
    monkeypatch.setattr(ai_router, "time", SimpleNamespace(perf_counter=lambda: 0.0))
    return captured, generated


class TestAiChatRoute:
    async def test_chat_without_coords_uses_client_weather_and_skips_enrichment(
        self, chat_env, monkeypatch
    ):
        captured, generated = chat_env
        calls = []

        async def fail_aqi(location, settings):
            calls.append("aqi")
            return None, None

        async def fail_weather(location, settings):
            calls.append("weather")

        monkeypatch.setattr(ai_router, "_load_air_quality", fail_aqi)
        monkeypatch.setattr(ai_router, "_load_weather", fail_weather)
        stale_weather = {"temperature": 1.0}

        result = await ai_router.chat(
            "u", ChatRequest(message="what is the weather?", weather=stale_weather), enrich=True
        )

        assert calls == []
        assert result.intent == "weather"
        assert result.provider == "test-llm"
        assert result.latencyMs == 0
        assert result.contextUsed is False
        assert result.dataCoverage == {"location": True}
        assert captured["kwargs"]["weather"] == stale_weather
        assert captured["kwargs"]["air_quality"] is None
        assert captured["message"] == "what is the weather?"
        assert generated["history"] == []

    async def test_chat_uses_attached_documents(self, chat_env, monkeypatch, inline_threads):
        captured, _ = chat_env
        chunks = [{"chunk": "attached excerpt", "score": 0.8}]

        monkeypatch.setattr(
            rag_service,
            "retrieve",
            lambda uid, message, top_k, file_ids: chunks,
        )

        result = await ai_router.chat(
            "u", ChatRequest(message="compare that with today", documentIds=["f1"]), enrich=False
        )

        assert result.contextUsed is True
        assert captured["kwargs"]["rag_chunks"] == chunks

    async def test_chat_live_enrichment_and_observed_history(
        self, chat_env, monkeypatch, frozen_clock
    ):
        captured, generated = chat_env
        calls = []

        async def fake_aqi(location, settings):
            calls.append("aqi")
            return aqi_payload(), [forecast_point()]

        async def fake_weather(location, settings):
            calls.append("weather")
            return weather_payload(hours=1)

        async def fake_history(location, settings, window):
            calls.append(window)
            return [history_day()], window[2]

        monkeypatch.setattr(ai_router, "_load_air_quality", fake_aqi)
        monkeypatch.setattr(ai_router, "_load_weather", fake_weather)
        monkeypatch.setattr(ai_router, "_load_history", fake_history)

        payload = ChatRequest(
            message="how was the air in 2023?",
            location=dict(LOCATION),
            history=[{"role": "user", "content": "earlier"}],
        )

        result = await ai_router.chat("u", payload, enrich=True)

        assert calls == ["aqi", ("2023-01-01", "2023-12-31", "2023")]
        assert captured["kwargs"]["air_quality"]["aqi"] == 142
        assert captured["kwargs"]["aqi_forecast"][0]["aqi"] == 110
        assert captured["kwargs"]["aqi_history"][0]["date"] == "2026-05-31"
        assert captured["kwargs"]["history_label"] == "2023"
        assert generated["history"][0]["role"] == "user"
        assert generated["context"] == "CONTEXT"
        assert result.intent == "historical"
        assert result.contextSections == ["SECTION"]
        assert result.degraded is False

    async def test_chat_weather_only_skips_aqi(self, chat_env, monkeypatch):
        captured, _ = chat_env
        calls = []

        async def fake_aqi(location, settings):
            calls.append("aqi")
            return aqi_payload(), None

        async def fake_weather(location, settings):
            calls.append("weather")
            return weather_payload(hours=1)

        monkeypatch.setattr(ai_router, "_load_air_quality", fake_aqi)
        monkeypatch.setattr(ai_router, "_load_weather", fake_weather)

        await ai_router.chat(
            "u",
            ChatRequest(message="what is the weather?", location=dict(LOCATION)),
            enrich=True,
        )

        assert calls == ["weather"]
        assert captured["kwargs"]["weather"]["current"]["temperature"] == 31.0
        assert captured["kwargs"]["air_quality"] is None

    async def test_chat_aqi_only_skips_weather(self, chat_env, monkeypatch):
        captured, _ = chat_env
        calls = []

        async def fake_aqi(location, settings):
            calls.append("aqi")
            return aqi_payload(aqi=99), [forecast_point(aqi=95)]

        async def fake_weather(location, settings):
            calls.append("weather")
            return weather_payload(hours=1)

        monkeypatch.setattr(ai_router, "_load_air_quality", fake_aqi)
        monkeypatch.setattr(ai_router, "_load_weather", fake_weather)

        await ai_router.chat(
            "u",
            ChatRequest(message="what is the aqi right now?", location=dict(LOCATION)),
            enrich=True,
        )

        assert calls == ["aqi"]
        assert captured["kwargs"]["air_quality"]["aqi"] == 99
        assert captured["kwargs"]["weather"] is None

    async def test_chat_reports_degraded_provider(self, chat_env, monkeypatch):
        _, generated = chat_env

        async def degraded(message, context, history):
            generated.update(message=message, context=context, history=history)
            return {"response": "grounded answer", "provider": "grounded-fallback", "degraded": True}

        monkeypatch.setattr(ai_router.ai_service, "generate_response", degraded)

        result = await ai_router.chat("u", ChatRequest(message="hello"), enrich=False)

        assert result.response == "grounded answer"
        assert result.provider == "grounded-fallback"
        assert result.degraded is True
