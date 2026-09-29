"""Retry policy for the shared HTTP helper.

The assistant talks to a shared free-tier model, so its 429 is a rate limit on
this application rather than a blip a second identical attempt will fix. Waiting
out the backoff in that case only adds seconds to every reply before the grounded
fallback answers anyway, so the LLM call narrows the retryable set and fails
fast. These tests pin both halves of that: a rate limit is not retried when the
caller opted out, and a 5xx or a 401 still behaves correctly.
"""

from __future__ import annotations

import httpx
import pytest

import http_client
from http_client import ProviderError, request_json

# A retryable set without 429, matching what the LLM call passes.
_NO_429 = frozenset({408, 425, 500, 502, 503, 504})


def _fake_client(calls: list[int], status: int, then: int | None = None):
    """Return a get_client replacement counting attempts.

    A fresh client per call keeps the attempt count accurate, because
    request_json resolves the client once per invocation.
    """
    state = {"n": 0}

    async def _get() -> httpx.AsyncClient:
        def handler(request: httpx.Request) -> httpx.Response:
            state["n"] += 1
            calls.append(state["n"])
            code = status if (then is None or state["n"] == 1) else then
            return httpx.Response(code, json={"ok": False})

        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    return _get


async def test_a_429_is_retried_by_default(monkeypatch):
    """Weather and AQI providers still recover from a transient 429."""
    calls: list[int] = []
    monkeypatch.setattr(http_client, "get_client", _fake_client(calls, 429))

    with pytest.raises(ProviderError) as exc:
        await request_json("GET", "http://provider.invalid/x", provider="weather", retries=1)

    assert exc.value.status == 429
    assert len(calls) == 2, "the default policy should still retry a rate limit"


async def test_a_429_is_not_retried_when_the_caller_opts_out(monkeypatch):
    """The LLM call must not wait out a backoff it cannot win."""
    calls: list[int] = []
    monkeypatch.setattr(http_client, "get_client", _fake_client(calls, 429))

    with pytest.raises(ProviderError) as exc:
        await request_json(
            "GET",
            "http://provider.invalid/x",
            provider="llm",
            retries=1,
            retry_statuses=_NO_429,
        )

    assert exc.value.status == 429
    assert len(calls) == 1, "a rate limit must not be retried when 429 is excluded"


async def test_a_500_is_still_retried_when_the_caller_opts_out_of_429(monkeypatch):
    """Excluding 429 must not disable legitimate retries for server errors."""
    calls: list[int] = []
    monkeypatch.setattr(http_client, "get_client", _fake_client(calls, 500))

    with pytest.raises(ProviderError) as exc:
        await request_json(
            "GET",
            "http://provider.invalid/x",
            provider="llm",
            retries=1,
            retry_statuses=_NO_429,
        )

    assert exc.value.status == 500
    assert len(calls) == 2, "5xx should still be retried"


async def test_a_401_is_never_retried(monkeypatch):
    """A bad credential is permanent; retrying it only wastes time."""
    calls: list[int] = []
    monkeypatch.setattr(http_client, "get_client", _fake_client(calls, 401))

    with pytest.raises(ProviderError) as exc:
        await request_json("GET", "http://provider.invalid/x", provider="llm", retries=3)

    assert exc.value.status == 401
    assert len(calls) == 1


async def test_a_success_on_the_second_attempt_still_returns_data(monkeypatch):
    calls: list[int] = []
    monkeypatch.setattr(http_client, "get_client", _fake_client(calls, 503, then=200))

    data = await request_json("GET", "http://provider.invalid/x", provider="llm", retries=1)

    assert data == {"ok": False}
    assert len(calls) == 2
