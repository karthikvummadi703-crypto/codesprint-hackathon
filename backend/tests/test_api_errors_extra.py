"""Additional error-handler, request-dependency and authentication coverage."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.deps import OptionalUid, request_uid
from config import get_settings
from errors import (
    AppError,
    NotFoundError,
    RateLimitError,
    UpstreamUnavailableError,
    register_exception_handlers,
)
from http_client import ProviderError
from services import firebase_service, geocoding_service


def _raise_handled_error(kind: str) -> None:
    if kind == "app":
        raise AppError("bad input")
    if kind == "not-found":
        raise NotFoundError("missing document")
    if kind == "upstream":
        raise UpstreamUnavailableError()
    if kind == "app-500":
        raise AppError("internal detail", 500)
    if kind == "rate-limited":
        raise RateLimitError(17)
    if kind == "provider":
        raise ProviderError("fake-provider", "connection refused")
    if kind == "http-error":
        raise StarletteHTTPException(status_code=409, detail="conflict")
    raise StarletteHTTPException(status_code=502, detail="bad gateway")


def _error_client() -> TestClient:
    """A tiny app whose only job is to raise each handled exception type."""
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/raise/{kind}")
    def handled_error(kind: str) -> None:
        _raise_handled_error(kind)

    @app.get("/manual-validation")
    def manual_validation() -> None:
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("body", "message"),
                    "msg": "bad message",
                    "input": "hidden-secret",
                },
                {"type": "value_error", "loc": ("query",), "msg": "missing query", "input": None},
            ]
        )

    @app.get("/unhandled")
    def unhandled() -> None:
        raise RuntimeError("secret /private/path")

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    ("kind", "status_code", "detail"),
    [
        ("app", 400, "bad input"),
        ("not-found", 404, "missing document"),
        ("upstream", 503, "An upstream data provider is temporarily unavailable."),
        ("app-500", 500, "internal detail"),
    ],
)
def test_app_error_handler_returns_exact_body(kind: str, status_code: int, detail: str) -> None:
    response = _error_client().get(f"/raise/{kind}")
    assert response.status_code == status_code
    assert response.json() == {"detail": detail}


def test_rate_limit_error_adds_retry_after_header() -> None:
    response = _error_client().get("/raise/rate-limited")
    assert response.status_code == 429
    assert response.json() == {"detail": "Too many requests. Please wait a moment and try again."}
    assert response.headers["retry-after"] == "17"


def test_provider_error_uses_a_fixed_client_facing_message() -> None:
    response = _error_client().get("/raise/provider")
    assert response.status_code == 503
    assert response.json() == {
        "detail": "The fake-provider data provider is temporarily unavailable. Please try again shortly."
    }
    assert "connection refused" not in response.text


@pytest.mark.parametrize(
    ("kind", "status_code", "detail"),
    [("http-error", 409, "conflict"), ("http-server-error", 502, "bad gateway")],
)
def test_http_exception_handler_preserves_detail(kind: str, status_code: int, detail: str) -> None:
    response = _error_client().get(f"/raise/{kind}")
    assert response.status_code == status_code
    assert response.json() == {"detail": detail}


def test_validation_handler_reports_fields_without_submitted_values() -> None:
    response = _error_client().get("/manual-validation")
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Invalid request.",
        "problems": [
            {"field": "message", "issue": "bad message"},
            {"field": "body", "issue": "missing query"},
        ],
    }
    assert "hidden-secret" not in response.text


def test_unhandled_error_never_leaks_the_exception_message() -> None:
    response = _error_client().get("/unhandled")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error."}
    assert "/private/path" not in response.text


@pytest.mark.parametrize("query", ["lat=17.38", "lon=78.49"])
def test_coordinates_dependency_requires_a_complete_pair(
    client: TestClient, auth: dict[str, str], query: str
) -> None:
    response = client.get(f"/api/aqi?{query}", headers=auth)
    assert response.status_code == 422
    assert response.json() == {"detail": "lat and lon must be provided together"}


def test_coordinates_dependency_requires_a_location(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/api/aqi", headers=auth)
    assert response.status_code == 422
    assert response.json() == {"detail": "Provide either lat/lon or a city name"}


def test_query_validation_exposes_fields_not_values(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/api/aqi?lat=abc&lon=78.49", headers=auth)
    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "Invalid request."
    assert [problem["field"] for problem in body["problems"]] == ["lat"]
    assert "abc" not in response.text


def _dependency_client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/uid/{value}")
    def with_state(request: Request, value: str) -> dict[str, str | None]:
        request.state.uid = value
        return {"uid": request_uid(request)}

    @app.get("/uid")
    def without_state(request: Request) -> dict[str, str | None]:
        return {"uid": request_uid(request)}

    @app.get("/optional")
    def optional(uid: OptionalUid) -> dict[str, str | None]:
        return {"uid": uid}

    return TestClient(app, raise_server_exceptions=False)


def test_request_uid_reads_verified_state() -> None:
    client = _dependency_client()
    assert client.get("/uid").json() == {"uid": None}
    assert client.get("/uid/alice").json() == {"uid": "alice"}


@pytest.mark.parametrize(
    ("header", "detail"),
    [
        ("Basic dev:alice", "Missing authentication token"),
        ("Bearer dev:", "Malformed authentication token"),
    ],
)
def test_optional_uid_rejects_malformed_tokens_on_public_routes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, header: str, detail: str
) -> None:
    async def no_places(query: str, limit: int = 5) -> list[dict[str, object]]:
        return []

    monkeypatch.setattr(geocoding_service, "search_places", no_places)
    response = client.get("/api/geocode/search?q=Chennai", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json() == {"detail": detail}


def test_optional_uid_accepts_a_verified_token(monkeypatch: pytest.MonkeyPatch) -> None:
    async def verify(value: str) -> str:
        assert value == "signed-token"
        return "firebase-user"

    monkeypatch.setattr(firebase_service, "verify_id_token", verify)
    response = _dependency_client().get("/optional", headers={"Authorization": "Bearer signed-token"})
    assert response.status_code == 200
    assert response.json() == {"uid": "firebase-user"}


def test_optional_uid_rejects_an_invalid_verified_token(monkeypatch: pytest.MonkeyPatch) -> None:
    async def verify(value: str) -> None:
        return None

    monkeypatch.setattr(firebase_service, "verify_id_token", verify)
    response = _dependency_client().get("/optional", headers={"Authorization": "Bearer forged-token"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired token"}


def test_dev_token_is_refused_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    import main as backend_main

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_DEV_AUTH", "false")
    get_settings.cache_clear()
    client = TestClient(backend_main.create_app(), raise_server_exceptions=False)
    response = client.get("/api/rag/files", headers={"Authorization": "Bearer dev:alice"})
    get_settings.cache_clear()
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired token"}
