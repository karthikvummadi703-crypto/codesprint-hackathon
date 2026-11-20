from __future__ import annotations

from test_security_and_api import build_client

from middleware import _FixedWindowCounter


class TestFixedWindowCounter:
    def test_permits_only_the_configured_number_of_hits(self, monkeypatch):
        monkeypatch.setattr("middleware.time.monotonic", lambda: 100.0)
        counter = _FixedWindowCounter()

        assert counter.hit("key", 2, 60) == (True, 0)
        assert counter.hit("key", 2, 60) == (True, 0)
        allowed, retry_after = counter.hit("key", 2, 60)
        assert allowed is False
        assert retry_after > 0

    def test_expired_hits_are_dropped(self, monkeypatch):
        ticks = iter([0.0, 1.0, 61.0])
        monkeypatch.setattr("middleware.time.monotonic", lambda: next(ticks))
        counter = _FixedWindowCounter()

        assert counter.hit("key", 1, 60) == (True, 0)
        assert counter.hit("key", 1, 60)[0] is False
        assert counter.hit("key", 1, 60) == (True, 0)


def test_rate_limit_returns_429_with_retry_after(monkeypatch):
    client = build_client(
        monkeypatch,
        ENVIRONMENT="test",
        ALLOW_DEV_AUTH="true",
        RATE_LIMIT_ENABLED="true",
        RATE_LIMIT_REQUESTS="1",
        RATE_LIMIT_WINDOW_S="60",
    )

    first = client.get("/api/health")
    assert first.status_code == 200
    assert first.headers["x-ratelimit-limit"] == "1"

    second = client.get("/api/health")
    assert second.status_code == 429
    assert int(second.headers["retry-after"]) > 0


def test_options_requests_bypass_rate_limit(monkeypatch):
    client = build_client(
        monkeypatch,
        ENVIRONMENT="test",
        ALLOW_DEV_AUTH="true",
        RATE_LIMIT_ENABLED="true",
        RATE_LIMIT_REQUESTS="1",
        RATE_LIMIT_WINDOW_S="60",
    )

    for _ in range(3):
        response = client.options("/api/health")
        assert response.status_code != 429
