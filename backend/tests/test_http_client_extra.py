"""Additional HTTP client, retry and connection-pool branches."""

from __future__ import annotations

import asyncio
from collections.abc import Callable

import httpx
import pytest

import http_client
from http_client import ProviderError, request_json

_URL = "http://provider.invalid/data"


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def no_sleep(seconds: float) -> None:
    assert seconds >= 0


def test_provider_error_exposes_provider_and_status() -> None:
    error = ProviderError("weather", "upstream failed", 503)
    assert str(error) == "upstream failed"
    assert error.provider == "weather"
    assert error.status == 503


async def test_transport_failures_are_retried_then_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        raise httpx.ConnectError("connection refused", request=request)

    client = make_client(handler)

    async def get_client() -> httpx.AsyncClient:
        return client

    monkeypatch.setattr(http_client, "get_client", get_client)
    monkeypatch.setattr(http_client.asyncio, "sleep", no_sleep)
    try:
        with pytest.raises(ProviderError, match="weather unreachable") as exc:
            await request_json("GET", _URL, provider="weather", retries=1)
        assert exc.value.status is None
        assert len(attempts) == 2
    finally:
        await client.aclose()


async def test_malformed_success_body_is_reported_as_a_provider_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = make_client(lambda request: httpx.Response(200, text="not json"))

    async def get_client() -> httpx.AsyncClient:
        return client

    monkeypatch.setattr(http_client, "get_client", get_client)
    try:
        with pytest.raises(ProviderError, match="malformed JSON") as exc:
            await request_json("GET", _URL, provider="weather", retries=0)
        assert exc.value.status == 200
    finally:
        await client.aclose()


async def test_retry_after_header_sets_the_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts: list[int] = []
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) == 1:
            return httpx.Response(429, headers={"Retry-After": "0.25"}, json={"ok": False})
        return httpx.Response(200, json={"ok": True})

    client = make_client(handler)

    async def get_client() -> httpx.AsyncClient:
        return client

    async def record_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(http_client, "get_client", get_client)
    monkeypatch.setattr(http_client.asyncio, "sleep", record_sleep)
    try:
        assert await request_json("GET", _URL, provider="weather", retries=1) == {"ok": True}
        assert attempts == [1, 1]
        assert sleeps == [0.25]
    finally:
        await client.aclose()


@pytest.mark.parametrize(
    ("header", "expected"),
    [(None, None), ("not-a-number", None), ("999", 15.0), ("-2", 0.0), ("0.5", 0.5)],
)
def test_retry_after_parsing(header: str | None, expected: float | None) -> None:
    response = httpx.Response(429, headers={} if header is None else {"Retry-After": header})
    assert http_client._retry_after_seconds(response) == expected


async def test_retries_zero_allows_a_single_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(503, json={"ok": False})

    client = make_client(handler)

    async def get_client() -> httpx.AsyncClient:
        return client

    monkeypatch.setattr(http_client, "get_client", get_client)
    monkeypatch.setattr(http_client.asyncio, "sleep", no_sleep)
    try:
        with pytest.raises(ProviderError, match="HTTP 503"):
            await request_json("GET", _URL, provider="weather", retries=0)
        assert len(attempts) == 1
    finally:
        await client.aclose()


async def test_pooled_client_is_reused_and_rebuilt_after_close(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http_client, "_client", None)
    monkeypatch.setattr(http_client, "_client_loop", None)
    client = await http_client.get_client()
    assert client is await http_client.get_client()
    assert not client.is_closed
    await http_client.close_client()
    replacement = await http_client.get_client()
    assert replacement is not client
    assert not replacement.is_closed
    await http_client.close_client()


async def test_a_closed_client_is_replaced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http_client, "_client", None)
    monkeypatch.setattr(http_client, "_client_loop", None)
    client = await http_client.get_client()
    await client.aclose()
    replacement = await http_client.get_client()
    assert replacement is not client
    assert not replacement.is_closed
    await http_client.close_client()


async def test_a_new_event_loop_gets_a_new_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http_client, "_client", None)
    monkeypatch.setattr(http_client, "_client_loop", None)
    monkeypatch.setattr(http_client, "_client_lock", None)
    other_loop = asyncio.new_event_loop()
    try:
        monkeypatch.setattr(http_client, "_client_loop", other_loop)
        client = await http_client.get_client()
        assert http_client._client_loop is not other_loop
        assert not client.is_closed
        await http_client.close_client()
    finally:
        other_loop.close()


async def test_close_without_a_client_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http_client, "_client", None)
    monkeypatch.setattr(http_client, "_client_loop", None)
    await http_client.close_client()
    assert http_client._client is None


def test_client_lock_is_created_on_demand(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http_client, "_client_lock", None)
    lock = http_client._lock()
    assert isinstance(lock, asyncio.Lock)
    assert http_client._lock() is lock


async def test_client_pool_uses_the_configured_user_agent() -> None:
    client = http_client._build_client()
    try:
        assert client.headers["User-Agent"]
        assert client.timeout.connect is not None
        assert client.timeout.connect <= 5.0
        assert client.follow_redirects is True
    finally:
        await client.aclose()
