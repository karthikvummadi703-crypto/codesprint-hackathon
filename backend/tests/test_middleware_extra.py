"""Additional middleware coverage: identity resolution, limits and headers."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient
from starlette.types import Scope

import main as backend_main
import middleware
from config import get_settings
from errors import AuthenticationError
from middleware import SecurityHeadersMiddleware, TimingMiddleware, _FixedWindowCounter, _identity
from services import security


def _request(
    headers: list[tuple[bytes, bytes]] | None = None,
    client_address: tuple[str, int] | None = ("testclient", 50000),
) -> Request:
    scope: Scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "root_path": "",
        "headers": headers if headers is not None else [],
        "client": client_address,
        "server": ("testserver", 80),
    }
    return Request(scope)


async def test_identity_prefers_an_already_verified_uid() -> None:
    request = _request([(b"authorization", b"Bearer dev:alice")])
    request.state.uid = "alice"

    assert await _identity(request) == "uid:alice"


async def test_identity_verifies_a_bearer_header(monkeypatch: pytest.MonkeyPatch) -> None:
    async def verify(request: Request) -> str:
        return "bob"

    monkeypatch.setattr(security, "get_uid", verify)

    assert await _identity(_request([(b"authorization", b"Bearer dev:bob")])) == "uid:bob"


async def test_identity_falls_back_to_the_peer_when_verification_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def reject(request: Request) -> str:
        raise AuthenticationError("Invalid or expired token")

    monkeypatch.setattr(security, "get_uid", reject)

    assert await _identity(_request([(b"authorization", b"Bearer forged")])) == "ip:testclient"


async def test_identity_ignores_a_client_supplied_forwarded_for_header() -> None:
    request = _request([(b"x-forwarded-for", b"1.2.3.4")])

    assert await _identity(request) == "ip:testclient"


async def test_identity_without_a_socket_peer_uses_unknown() -> None:
    assert await _identity(_request(client_address=None)) == "ip:unknown"


def test_fixed_window_counter_keeps_stale_keys_after_a_prune_pass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = [0.0]
    monkeypatch.setattr("middleware.time.monotonic", lambda: clock[0])
    counter = _FixedWindowCounter()

    for index in range(255):
        assert counter.hit(f"k{index}", 10, 1)[0] is True
    clock[0] = 100.0

    assert counter.hit("trigger", 10, 1)[0] is True
    assert "k0" in counter._hits
    assert "trigger" in counter._hits
    assert counter.hit("k0", 10, 1)[0] is True


def test_fixed_window_counter_reset_clears_the_window() -> None:
    counter = _FixedWindowCounter()

    assert counter.hit("key", 1, 60)[0] is True
    counter.reset()
    assert counter.hit("key", 1, 60)[0] is True


def test_security_headers_do_not_override_an_explicit_response_value() -> None:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/custom")
    def custom() -> Response:
        return Response(
            "ok",
            headers={
                "X-Frame-Options": "SAMEORIGIN",
                "Content-Security-Policy": "default-src 'none'",
            },
        )

    client = TestClient(app)

    response = client.get("/custom")

    assert response.status_code == 200
    assert response.headers["x-frame-options"] == "SAMEORIGIN"
    assert response.headers["content-security-policy"] == "default-src 'none'"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["permissions-policy"] == (
        "camera=(), microphone=(), geolocation=(self), payment=(), usb=()"
    )


def test_timing_header_is_added_to_error_responses() -> None:
    app = FastAPI()
    app.add_middleware(TimingMiddleware)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/missing")

    assert response.status_code == 404
    assert response.headers["x-response-time-ms"].isdigit()


def _limited_client(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> TestClient:
    env = {
        "ENVIRONMENT": "test",
        "ALLOW_DEV_AUTH": "true",
        "RATE_LIMIT_ENABLED": "true",
        "RATE_LIMIT_REQUESTS": "120",
        "RATE_LIMIT_WINDOW_S": "60",
        "RATE_LIMIT_CHAT_REQUESTS": "15",
        "RATE_LIMIT_CHAT_WINDOW_S": "300",
    }
    env.update(overrides)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    return TestClient(backend_main.create_app(), raise_server_exceptions=False)


def test_costly_path_uses_its_own_budget_and_headers(
    monkeypatch: pytest.MonkeyPatch, auth: dict[str, str]
) -> None:
    client = _limited_client(monkeypatch, RATE_LIMIT_CHAT_REQUESTS="1", RATE_LIMIT_CHAT_WINDOW_S="300")

    first = client.post("/api/ai/chat", headers=auth)
    second = client.post("/api/ai/chat", headers=auth)
    health = client.get("/api/health")

    assert first.status_code == 422
    assert first.headers["x-ratelimit-limit"] == "1"
    assert first.headers["x-ratelimit-window"] == "300"
    assert second.status_code == 429
    assert second.json() == {"detail": "Too many requests. Please wait a moment and try again."}
    assert int(second.headers["retry-after"]) > 0
    assert health.headers["x-ratelimit-limit"] == "120"


def test_rate_limit_identity_is_scoped_to_the_verified_uid(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _limited_client(monkeypatch, RATE_LIMIT_REQUESTS="1")
    alice = {"Authorization": "Bearer dev:alice"}
    bob = {"Authorization": "Bearer dev:bob"}

    first = client.get("/api/health", headers=alice)
    other = client.get("/api/health", headers=bob)
    repeated = client.get("/api/health", headers=alice)

    assert first.status_code == 200
    assert other.status_code == 200
    assert repeated.status_code == 429
    assert repeated.json() == {"detail": "Too many requests. Please wait a moment and try again."}


def test_rate_limit_does_not_apply_outside_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _limited_client(monkeypatch, RATE_LIMIT_REQUESTS="1")

    first = client.get("/not-an-api")
    second = client.get("/not-an-api")

    assert first.status_code == 404
    assert second.status_code == 404
    assert "x-ratelimit-limit" not in second.headers


def test_counter_prune_is_noop_when_all_buckets_are_active(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = [0.0]
    monkeypatch.setattr("middleware.time.monotonic", lambda: clock[0])
    counter = _FixedWindowCounter()

    for index in range(255):
        assert counter.hit(f"k{index}", 10, 60)[0] is True
    before = dict(counter._hits)

    assert counter.hit("trigger", 10, 60)[0] is True
    assert counter._hits == {**before, "trigger": counter._hits["trigger"]}
    assert middleware._counters is not counter
