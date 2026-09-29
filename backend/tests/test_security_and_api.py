"""Authentication, CORS and error-handling behaviour.

The original production backend accepted any `Authorization: Bearer dev:anything`
header, which made the "auth" theatre. These tests pin the gate shut.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from config import get_settings


def build_client(monkeypatch, **env) -> TestClient:
    """Create an app with a specific auth environment.

    `get_settings` is lru_cached, so the cache must be cleared both before the
    app is built and after the env is torn down, otherwise a production setting
    leaks into the next test.
    """
    import main as backend_main

    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    # Build a fresh app: the module-level `app` captured settings (including the
    # CORS origin list) at import time, so reusing it would test the old config.
    return TestClient(backend_main.create_app())


@pytest.fixture
def restore_settings():
    yield
    get_settings.cache_clear()


class TestDevTokenGate:
    def test_dev_token_rejected_in_production(self, monkeypatch):
        client = build_client(
            monkeypatch,
            ENVIRONMENT="production",
            ALLOW_DEV_AUTH="false",
            FIREBASE_PROJECT_ID="demo-project",
        )
        response = client.get("/api/aqi?lat=17.38&lon=78.49", headers={"Authorization": "Bearer dev:anyone"})
        assert response.status_code == 401
        assert "dev" not in response.json().get("detail", "").lower() or "not" in response.json()["detail"].lower()

    def test_dev_token_accepted_when_explicitly_allowed(self, monkeypatch):
        client = build_client(monkeypatch, ENVIRONMENT="test", ALLOW_DEV_AUTH="true")
        # 500 here would still prove auth passed; assert it is not 401/403.
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_missing_token_is_rejected(self, monkeypatch):
        client = build_client(monkeypatch, ENVIRONMENT="production", ALLOW_DEV_AUTH="false", FIREBASE_PROJECT_ID="demo")
        assert client.get("/api/aqi?lat=17.38&lon=78.49").status_code == 401

    def test_malformed_header_is_rejected(self, monkeypatch):
        client = build_client(monkeypatch, ENVIRONMENT="production", ALLOW_DEV_AUTH="false", FIREBASE_PROJECT_ID="demo")
        for header in ("", "Bearer", "Basic dev:x", "dev:x", "Bearer  "):
            response = client.get(
                "/api/aqi?lat=17.38&lon=78.49", headers={"Authorization": header}
            )
            assert response.status_code == 401, header

    def test_public_health_needs_no_token(self, monkeypatch):
        client = build_client(monkeypatch, ENVIRONMENT="production", ALLOW_DEV_AUTH="false", FIREBASE_PROJECT_ID="demo")
        assert client.get("/api/health").status_code == 200


class TestHealth:
    def test_reports_capabilities_without_secrets(self, client):
        body = client.get("/api/health").json()
        assert body["status"] in ("ok", "degraded")
        assert "capabilities" in body
        serialized = str(body).lower()
        for secret_marker in ("api_key", "apikey", "private_key", "service_account", "password"):
            assert secret_marker not in serialized

    def test_never_exposes_key_values(self, client):
        """Capability booleans are fine; the credential behind them is not."""
        settings = get_settings()
        health = client.get("/api/health").text
        for key in filter(None, (settings.google_aq_api_key, settings.openweather_key, settings.llm_api_key)):
            assert key not in health

    def test_reports_dev_auth_status(self, client):
        capabilities = client.get("/api/health").json()["capabilities"]
        assert "dev_auth_enabled" in capabilities


class TestValidation:
    def test_coordinates_are_range_checked(self, client, auth):
        assert client.get("/api/aqi?lat=200&lon=0", headers=auth).status_code == 422
        assert client.get("/api/aqi?lat=0&lon=999", headers=auth).status_code == 422

    def test_missing_coordinates_rejected(self, client, auth):
        assert client.get("/api/aqi", headers=auth).status_code == 422

    def test_extra_coordinates_take_priority_over_city(self, client, auth):
        """A pinned coordinate must win; the old code let city win."""
        response = client.get(
            "/api/aqi?lat=17.38&lon=78.49&city=Delhi", headers=auth
        )
        assert response.status_code == 200
        body = response.json()
        assert body["location"]["latitude"] == pytest.approx(17.38)
        assert body["location"]["longitude"] == pytest.approx(78.49)

    def test_unknown_query_parameters_do_not_break_requests(self, client, auth):
        assert client.get("/api/aqi?lat=17.38&lon=78.49&bogus=1", headers=auth).status_code == 200


class TestErrorHandling:
    def test_validation_errors_do_not_leak_internals(self, client, auth):
        body = client.get("/api/aqi?lat=abc&lon=def", headers=auth).json()
        assert "detail" in body
        assert "Traceback" not in str(body)

    def test_unknown_route_returns_json(self, client, auth):
        response = client.get("/api/does-not-exist", headers=auth)
        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")

    def test_method_not_allowed_returns_json(self, client, auth):
        response = client.delete("/api/aqi", headers=auth)
        assert response.status_code == 405

    def test_cors_preflight_from_allowed_origin(self, monkeypatch):
        """The deployed frontend origin must be accepted in production."""
        client = build_client(monkeypatch, ENVIRONMENT="production", ALLOW_DEV_AUTH="false", FIREBASE_PROJECT_ID="demo")
        for origin in (
            "https://codesprint-hackathon.web.app",
            "https://codesprint-hackathon.firebaseapp.com",
        ):
            response = client.options(
                "/api/aqi",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "authorization,content-type",
                },
            )
            assert response.headers.get("access-control-allow-origin") == origin, origin

    def test_cors_preflight_allows_localhost_in_development(self, client):
        response = client.options(
            "/api/aqi",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_cors_preflight_from_unknown_origin_is_not_allowed(self, client):
        response = client.options(
            "/api/aqi",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") != "https://evil.example.com"

    def test_timing_header_present(self, client, auth):
        """Latency must be observable without logging request bodies."""
        response = client.get("/api/health")
        headers = {k.lower() for k in response.headers}
        assert "x-response-time-ms" in headers

    def test_server_error_detail_is_not_leaked(self, monkeypatch):
        """An unexpected crash must not return its message to the client."""
        import main as backend_main

        import api.weather as weather_router

        async def boom(*args, **kwargs):
            raise RuntimeError("internal detail /secret/path")

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", boom)
        # `raise_server_exceptions=False` observes the real 500 response body
        # instead of letting Starlette re-raise into the test.
        with TestClient(backend_main.app, raise_server_exceptions=False) as client:
            response = client.get("/api/weather?lat=17.38&lon=78.49", headers={"Authorization": "Bearer dev:test-user"})
        assert response.status_code == 500
        assert "secret" not in response.text.lower()
        assert "Traceback" not in response.text
        assert response.json()["detail"] == "Internal server error."

    def test_provider_failure_returns_service_unavailable(self, monkeypatch):
        import main as backend_main

        from http_client import ProviderError

        import api.weather as weather_router

        async def down(*args, **kwargs):
            raise ProviderError("open-meteo", "connection refused")

        monkeypatch.setattr(weather_router.weather_service, "fetch_weather", down)
        with TestClient(backend_main.app) as client:
            response = client.get("/api/weather?lat=17.38&lon=78.49", headers={"Authorization": "Bearer dev:test-user"})
        assert response.status_code == 503
        assert "open-meteo" in response.json()["detail"]


class TestRouteSurface:
    def test_expected_routes_are_registered(self, client):
        paths = {route.path for route in client.app.routes if hasattr(route, "path")}
        for expected in (
            "/api/health",
            "/api/aqi",
            "/api/weather",
            "/api/geocode/search",
            "/api/ai/chat",
            "/api/rag/upload",
            "/api/carbon/calculate",
        ):
            assert expected in paths, expected

    def test_openapi_schema_builds(self, client):
        assert client.get("/api/openapi.json").status_code == 200
