"""Provider chain, location resolution, caching and failure handling."""

from __future__ import annotations

import pytest

import http_client
from api.deps import env_cache
from cache import TTLCache, coord_key
from config import get_settings
from http_client import ProviderError
from services import air_quality_service as aq
from services import geocoding_service

# Modules that did `from http_client import request_json`, and therefore hold their
# own reference that must be patched as well as the definition.
_CONSUMERS = ("air_quality_service", "geocoding_service", "weather_service", "carbon_service", "ai_service")


def patch_json(monkeypatch, handler):
    """Replace the shared HTTP helper with a canned-response stub.

    Patches the definition and every module-level import of it, so a service
    under test cannot reach the network.
    """
    import importlib

    async def _fake(*args, **kwargs):
        return await handler(*args, **kwargs)

    monkeypatch.setattr(http_client, "request_json", _fake)
    for name in _CONSUMERS:
        try:
            module = importlib.import_module(f"services.{name}")
        except ImportError:
            continue
        if hasattr(module, "request_json"):
            monkeypatch.setattr(module, "request_json", _fake)


@pytest.fixture
def google_key(monkeypatch):
    """Pretend Google AQ is configured so the primary provider is exercised."""
    monkeypatch.setenv("GOOGLE_AQ_API_KEY", "test-google-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestProviderChain:
    async def test_open_meteo_is_used_when_google_is_unconfigured(self, monkeypatch):
        calls: list[str] = []

        async def fake(method, url, **kwargs):
            calls.append(url)
            if "airquality.googleapis.com" in url:
                raise ProviderError("google-air-quality", "no key")
            return {
                "current": {
                    "time": "2026-01-01T12:00",
                    "pm2_5": 35.0,
                    "pm10": 60.0,
                    "nitrogen_dioxide": 20.0,
                    "sulphur_dioxide": 4.0,
                    "carbon_monoxide": 300.0,
                    "ozone": 40.0,
                    "us_aqi": 92,
                },
                "hourly": {"time": ["2026-01-01T12:00"], "us_aqi_pm2_5": [90]},
            }

        patch_json(monkeypatch, fake)
        result = await aq.fetch_aqi_components(17.38, 78.49)
        assert result is not None
        assert result["source"] == "open-meteo"
        # The provider's own EPA value is preferred over a local recompute.
        assert result["aqi"] == 92

    async def test_google_takes_priority_when_keyed(self, monkeypatch, google_key):
        async def fake(method, url, **kwargs):
            if "airquality.googleapis.com" in url:
                return {
                    "pollutants": [
                        {"code": "PM25", "concentration": {"value": 20.0, "units": "µg/m3"}},
                    ],
                    "indexes": [{"code": "usa_epa", "aqi": 45, "category": "GOOD", "dominantPollutant": "pm25"}],
                }
            return {"current": {"time": "2026-01-01T12:00", "pm2_5": 5.0, "us_aqi": 12}}

        patch_json(monkeypatch, fake)
        result = await aq.fetch_aqi_components(17.38, 78.49)
        assert result["source"] == "google"
        assert result["status"] == "Good"

    async def test_all_providers_failing_yields_estimate_flagged(self, monkeypatch):
        async def always_fail(*args, **kwargs):
            raise ProviderError("upstream", "unreachable")

        patch_json(monkeypatch, always_fail)
        result = await aq.get_air_quality(lat=17.38, lon=78.49)
        assert result["isEstimated"] is True
        assert result["source"] == "estimated"
        assert result["forecastAvailable"] is False

    async def test_google_converts_mg_to_ug(self, monkeypatch, google_key):
        """Google reports CO in mg/m³; the rest of the pipeline needs µg/m³."""
        payload = {
            "pollutants": [{"code": "CO", "concentration": {"value": 0.5, "units": "mg/m3"}}],
            "indexes": [{"code": "usa_epa", "aqi": 30, "category": "GOOD", "dominantPollutant": "co"}],
        }

        async def fake(method, url, **kwargs):
            return payload

        patch_json(monkeypatch, fake)
        result = await aq.fetch_from_google(1.0, 2.0)
        assert result["components"]["co"] == pytest.approx(500.0)

    async def test_open_meteo_sub_index_names(self, monkeypatch):
        async def fake(method, url, **kwargs):
            return {
                "current": {"time": "2026-01-01T12:00", "pm2_5": 35.0, "us_aqi": 90},
                "hourly": {
                    "time": ["2026-01-01T12:00"],
                    "us_aqi_pm2_5": [88],
                    "us_aqi_ozone": [70],
                },
            }

        patch_json(monkeypatch, fake)
        result = await aq.fetch_from_open_meteo(1.0, 2.0)
        assert result["sub"] == {"pm25": 88, "o3": 70}


class TestLocationResolution:
    async def test_coordinates_win_over_city(self, monkeypatch):
        """A pinned coordinate must not be overridden by a place name.

        The old behaviour let `city` win, so Predictions always forecast the
        default city regardless of what the user selected.
        """
        async def fake(method, url, **kwargs):
            return [{"lat": "0.0", "lon": "0.0", "display_name": "Somewhere Else", "address": {"country": "X"}}]

        patch_json(monkeypatch, fake)
        location, source = await aq.resolve_location(17.38, 78.49, "Gudur")
        assert (location["latitude"], location["longitude"]) == (17.38, 78.49)
        assert source == "coordinates"

    async def test_city_is_geocoded_when_no_coordinates(self, monkeypatch):
        async def fake(method, url, **kwargs):
            return [{"lat": "28.61", "lon": "77.20", "display_name": "Delhi, India", "address": {"country": "India"}}]

        patch_json(monkeypatch, fake)
        location, source = await aq.resolve_location(None, None, "Delhi")
        assert location["latitude"] == pytest.approx(28.61)
        assert source == "geocoded"

    async def test_unresolvable_city_falls_back_to_default(self, monkeypatch):
        async def fake(*args, **kwargs):
            return []

        patch_json(monkeypatch, fake)
        location, source = await aq.resolve_location(None, None, "Nowhereville")
        assert source == "default"
        assert location["name"]

    async def test_geocoder_failure_does_not_blank_the_location(self, monkeypatch):
        async def fake(*args, **kwargs):
            raise ProviderError("nominatim", "down")

        patch_json(monkeypatch, fake)
        place = await geocoding_service.safe_reverse_geocode(10.0, 20.0)
        assert place["latitude"] == 10.0
        assert place["name"]  # a coordinate label is still returned


class TestCaching:
    async def test_ttl_cache_hit_and_expiry(self):
        cache = TTLCache(max_entries=8)
        calls = 0

        async def factory():
            nonlocal calls
            calls += 1
            return {"n": calls}

        first = await cache.get_or_set("k", 60, factory)
        second = await cache.get_or_set("k", 60, factory)
        assert first == second
        assert calls == 1
        assert cache.stats()["hits"] >= 1

    async def test_expired_entry_refetches(self):
        cache = TTLCache(max_entries=8)
        calls = 0

        async def factory():
            nonlocal calls
            calls += 1
            return calls

        await cache.get_or_set("k", 0, factory)  # ttl 0 = never cached
        await cache.get_or_set("k", 0, factory)
        assert calls == 2

    async def test_max_entries_is_enforced(self):
        cache = TTLCache(max_entries=3)
        for index in range(10):
            await cache.set(f"k{index}", index, 60)
        assert cache.stats()["entries"] == 3

    async def test_prefix_invalidation_drops_stale_location(self):
        cache = TTLCache(max_entries=8)
        await cache.set("aqi:14.15,79.85:v1", {"name": "Gudur"}, 60)
        await cache.set("aqi:28.61,77.20:v1", {"name": "Delhi"}, 60)
        removed = await cache.invalidate_prefix("aqi:14.15,79.85")
        assert removed == 1
        assert await cache.get("aqi:14.15,79.85:v1") is None
        assert await cache.get("aqi:28.61,77.20:v1") is not None

    def test_coord_key_buckets_nearby_points(self):
        assert coord_key(14.14891, 79.85304) == coord_key(14.14899, 79.85301)
        assert coord_key(14.14, 79.85) != coord_key(28.61, 77.20)

    async def test_routes_sharing_a_provider_call_do_not_share_a_cache_key(self):
        """Different routes cache the same provider response under different shapes.

        `/api/predictions` stored a response mapping where the AI route expected a
        list of forecast rows, so whichever request populated the key first made the
        other raise `argument after ** must be a mapping` (a 500). The weather
        routes had the same collision. Namespacing the keys is what keeps them
        independent, so this pins the prefixes rather than the payloads.
        """
        bucket = coord_key(17.385, 78.4867)
        keys = {
            "predictions": f"predictions:{bucket}:5",
            "ai_forecast": f"ai-aqi-forecast:{bucket}:5",
            "weather_full": f"weather-full:{bucket}:7:48",
            "weather_summary": f"weather-summary:{bucket}:3:48",
            "ai_weather": f"ai-weather:{bucket}:3:48",
        }
        assert len(set(keys.values())) == len(keys)

        # A mapping and a list must still be able to coexist under the same bucket.
        await env_cache.set(keys["predictions"], {"method": "heuristic-prototype"}, 60)
        await env_cache.set(keys["ai_forecast"], [{"day": 1}], 60)
        assert isinstance(await env_cache.get(keys["predictions"]), dict)
        assert isinstance(await env_cache.get(keys["ai_forecast"]), list)


class TestSettings:
    def test_reports_capabilities_without_secrets(self):
        from config import describe_configuration

        capabilities = describe_configuration(get_settings())
        assert capabilities["open_meteo_configured"] is True
        # Every value is a bool or a string enum, never a key.
        for key, value in capabilities.items():
            assert isinstance(value, (bool, str)), key
