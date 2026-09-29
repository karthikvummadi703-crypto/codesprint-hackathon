"""Model failover in the assistant.

A free-tier chat endpoint is not a dependable single dependency: it rate-limits
(429) and sometimes answers HTTP 200 with an empty body, which used to reach the
user as a blank chat bubble. These tests pin the behaviour that keeps the
assistant answering instead of silently degrading.
"""

from __future__ import annotations

import anyio
import pytest

from config import Settings
from http_client import ProviderError
from services import ai_service

CONTEXT = (
    "SELECTED LOCATION [pinned, source: user]: Hyderabad, India\n"
    "AIR QUALITY (NOW) [modelled, provider: open-meteo]: AQI 42 — Good\n"
)


def _configure(monkeypatch, primary: str, fallbacks: tuple[str, ...] = ()) -> None:
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("LLM_MODEL", primary)
    monkeypatch.setenv("LLM_FALLBACK_MODELS", ",".join(fallbacks))
    ai_service.reset_breaker()


def _completion(content: str) -> dict:
    return {
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 11, "completion_tokens": 7},
    }


def _raise(status: int):
    """Build a fake provider call that always fails with `status`."""

    async def call(method, url, *, provider, json_body=None, **_):
        raise ProviderError("llm", "upstream said no", status)

    return call


@pytest.fixture(autouse=True)
def _clean_breaker():
    ai_service.reset_breaker()
    yield
    ai_service.reset_breaker()


# --------------------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------------------


def test_model_chain_is_primary_first():
    assert Settings(llm_model="a", llm_fallback_models=("b", "c")).llm_model_chain == ("a", "b", "c")


def test_model_chain_drops_duplicates_and_blanks():
    """A model repeated in the env list must not be retried against the same limit."""
    settings = Settings(llm_model="a", llm_fallback_models=("a", "  ", "b", "a"))
    assert settings.llm_model_chain == ("a", "b")


def test_model_chain_with_no_fallbacks_is_just_the_primary():
    assert Settings(llm_model="only").llm_model_chain == ("only",)


def test_model_chain_is_empty_without_a_model():
    assert Settings(llm_model="", llm_fallback_models=("",)).llm_model_chain == ()


# --------------------------------------------------------------------------------------
# Failover between models
# --------------------------------------------------------------------------------------


def test_rate_limited_primary_falls_through_to_the_next_model(monkeypatch):
    _configure(monkeypatch, "primary", ("secondary",))
    tried: list[str] = []

    async def fake_request(method, url, *, provider, json_body=None, **_):
        tried.append(json_body["model"])
        if json_body["model"] == "primary":
            raise ProviderError("llm", "rate limited", 429)
        return _completion("Answer from the secondary model.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["degraded"] is False
    assert result["provider"] == "secondary"
    assert "secondary model" in result["response"]
    assert tried == ["primary", "secondary"]


def test_empty_content_is_treated_as_a_failure_not_an_answer(monkeypatch):
    """A 200 with no text must never become a blank assistant bubble."""
    _configure(monkeypatch, "primary", ("secondary",))
    tried: list[str] = []

    async def fake_request(method, url, *, provider, json_body=None, **_):
        tried.append(json_body["model"])
        if json_body["model"] == "primary":
            return _completion("   ")
        return _completion("Real answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["degraded"] is False
    assert result["response"] == "Real answer."
    assert tried == ["primary", "secondary"]


def test_unreadable_body_shape_moves_to_the_next_model(monkeypatch):
    _configure(monkeypatch, "primary", ("secondary",))

    async def fake_request(method, url, *, provider, json_body=None, **_):
        if json_body["model"] == "primary":
            return {"unexpected": "shape"}
        return _completion("Recovered answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["degraded"] is False
    assert result["response"] == "Recovered answer."


def test_token_usage_is_reported_from_the_model_that_answered(monkeypatch):
    _configure(monkeypatch, "primary", ("secondary",))

    async def fake_request(method, url, *, provider, json_body=None, **_):
        if json_body["model"] == "primary":
            raise ProviderError("llm", "boom", 500)
        return _completion("Answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["provider"] == "secondary"
    assert result["prompt_tokens"] == 11
    assert result["completion_tokens"] == 7


# --------------------------------------------------------------------------------------
# Degrading only when the whole chain fails
# --------------------------------------------------------------------------------------


def test_whole_chain_rate_limited_returns_a_grounded_answer(monkeypatch):
    _configure(monkeypatch, "a", ("b",))
    tried: list[str] = []

    async def fake_request(method, url, *, provider, json_body=None, **_):
        tried.append(json_body["model"])
        raise ProviderError("llm", "rate limited", 429)

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["degraded"] is True
    assert result["provider"] == "grounded-fallback"
    assert tried == ["a", "b"]


def test_a_429_on_the_whole_chain_does_not_retry_the_same_model(monkeypatch):
    """Retrying a rate limit just waits out the backoff and still fails."""
    _configure(monkeypatch, "a", ("b",))
    calls: list[str] = []

    async def fake_request(method, url, *, provider, json_body=None, **_):
        calls.append(json_body["model"])
        raise ProviderError("llm", "rate limited", 429)

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert calls == ["a", "b"]


def test_breaker_absorbs_one_rate_limited_message(monkeypatch):
    """The chain already absorbs a single rate limit, so one outage must not open
    the breaker and start short-circuiting every later message."""
    _configure(monkeypatch, "a", ("b",))
    monkeypatch.setattr(ai_service, "request_json", _raise(429))

    anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)
    assert ai_service._breaker_is_open() is False


def test_breaker_opens_after_repeated_whole_chain_failures(monkeypatch):
    _configure(monkeypatch, "a", ("b",))
    monkeypatch.setattr(ai_service, "request_json", _raise(429))

    for _ in range(ai_service._RATE_LIMIT_THRESHOLD):
        anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert ai_service._breaker_is_open() is True


def test_breaker_clears_itself_after_the_cooldown_and_a_successful_probe(monkeypatch):
    """An open breaker must recover on its own, with no restart.

    While open the provider is not called at all, so recovery is detected by the
    first probe once the cooldown has elapsed.
    """
    _configure(monkeypatch, "a")
    monkeypatch.setattr(ai_service, "request_json", _raise(429))

    for _ in range(ai_service._RATE_LIMIT_THRESHOLD):
        anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)
    assert ai_service._breaker_is_open() is True

    # Cooldown elapses.
    ai_service._rate_limit_open_until = 0.0

    async def ok(method, url, *, provider, json_body=None, **_):
        return _completion("Recovered.")

    monkeypatch.setattr(ai_service, "request_json", ok)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["degraded"] is False
    assert result["response"] == "Recovered."
    assert ai_service._rate_limit_streak == 0
    assert ai_service._breaker_is_open() is False


def test_open_breaker_short_circuits_without_calling_the_provider(monkeypatch):
    _configure(monkeypatch, "a")
    monkeypatch.setattr(ai_service, "request_json", _raise(429))

    for _ in range(ai_service._RATE_LIMIT_THRESHOLD):
        anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)
    assert ai_service._breaker_is_open() is True

    calls: list[str] = []

    async def counting(method, url, *, provider, json_body=None, **_):
        calls.append("called")
        return _completion("should not happen")

    monkeypatch.setattr(ai_service, "request_json", counting)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert calls == []
    assert result["degraded"] is True


def test_missing_api_key_degrades_without_calling_the_provider(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_MODEL", "a")
    ai_service.reset_breaker()

    calls: list[str] = []

    async def counting(method, url, *, provider, json_body=None, **_):
        calls.append("called")
        return _completion("nope")

    monkeypatch.setattr(ai_service, "request_json", counting)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert calls == []
    assert result["degraded"] is True
    assert result["provider"] == "grounded-fallback"


def test_a_degraded_reply_is_never_blank(monkeypatch):
    """Whatever the failure, the user gets words back."""
    _configure(monkeypatch, "a")
    monkeypatch.setattr(ai_service, "request_json", _raise(429))

    result = anyio.run(ai_service.generate_response, "What is the AQI?", CONTEXT)

    assert result["response"].strip()
