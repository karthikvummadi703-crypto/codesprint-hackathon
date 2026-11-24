"""Additional LLM prompt, history and degraded-response branches."""

from __future__ import annotations

from collections.abc import Iterator

import anyio
import pytest

from services import ai_service

_CONTEXT = "SELECTED LOCATION: Hyderabad\n\nAIR QUALITY (NOW): AQI 42 — Good"


class _FakeClock:
    def __init__(self, values: Iterator[float]) -> None:
        self._values = values

    def perf_counter(self) -> float:
        return next(self._values)


@pytest.fixture(autouse=True)
def clean_breaker() -> None:
    ai_service.reset_breaker()


def completion(content: str, finish_reason: str = "stop", usage: object = None) -> dict[str, object]:
    return {
        "choices": [{"message": {"content": content}, "finish_reason": finish_reason}],
        "usage": usage,
    }


def configure(monkeypatch: pytest.MonkeyPatch, model: str = "primary") -> None:
    monkeypatch.setenv("LLM_API_KEY", "configured-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("LLM_MODEL", model)
    monkeypatch.setenv("LLM_FALLBACK_MODELS", "")
    monkeypatch.setenv("LLM_REASONING_EFFORT", "")
    monkeypatch.setenv("LLM_MAX_TOKENS", "700")


def test_history_messages_filters_invalid_roles_and_truncates_long_turns() -> None:
    history: list[dict[str, object]] = [
        {"role": "system", "content": "not a chat turn"},
        {"role": "user", "content": "   "},
        {"role": "assistant", "content": "x" * 1300},
        {"role": "user", "content": "newest turn"},
    ]
    assert ai_service._history_messages(history) == [
        {"role": "assistant", "content": "x" * ai_service._MAX_TURN_CHARS},
        {"role": "user", "content": "newest turn"},
    ]


def test_history_messages_drop_the_oldest_turns_when_over_budget() -> None:
    history: list[dict[str, object]] = [
        {"role": "user", "content": "y" * ai_service._MAX_TURN_CHARS} for _ in range(6)
    ]
    messages = ai_service._history_messages(history)
    assert len(messages) == 5
    assert sum(len(str(message["content"])) for message in messages) <= ai_service._MAX_TOKENS_BUDGET


def test_empty_model_chain_degrades_without_a_provider_call(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, model="")

    async def unexpected(*args: object, **kwargs: object) -> dict[str, object]:
        raise AssertionError("no model means no provider call")

    monkeypatch.setattr(ai_service, "request_json", unexpected)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", _CONTEXT)
    assert result["degraded"] is True
    assert "not configured" in str(result["response"])
    assert result["provider"] == "grounded-fallback"


def test_reasoning_effort_is_sent_as_a_provider_field(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)
    monkeypatch.setenv("LLM_REASONING_EFFORT", "low")
    seen: list[dict[str, object]] = []

    async def fake_request(method: str, url: str, **kwargs: object) -> dict[str, object]:
        body = kwargs["json_body"]
        assert isinstance(body, dict)
        seen.append(body)
        return completion("Reasoned answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "hello", _CONTEXT)
    assert result["response"] == "Reasoned answer."
    assert seen[0]["reasoning"] == {"effort": "low"}


def test_context_and_history_are_injected_in_message_order(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)
    seen: list[dict[str, object]] = []

    async def fake_request(method: str, url: str, **kwargs: object) -> dict[str, object]:
        body = kwargs["json_body"]
        assert isinstance(body, dict)
        assert isinstance(body["messages"], list)
        seen.extend(message for message in body["messages"] if isinstance(message, dict))
        return completion("Ordered answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    anyio.run(
        ai_service.generate_response,
        "What is the AQI?",
        _CONTEXT,
        [{"role": "user", "content": "earlier question"}],
    )
    assert seen[0]["role"] == "system"
    assert "CONTEXT" in str(seen[1]["content"])
    assert "AQI 42" in str(seen[1]["content"])
    assert seen[2]["content"] == "earlier question"
    assert seen[3] == {"role": "user", "content": "What is the AQI?"}


def test_truncation_at_the_maximum_budget_is_kept_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)
    monkeypatch.setenv("LLM_MAX_TOKENS", str(ai_service._MAX_OUTPUT_TOKENS))
    calls: list[str] = []

    async def fake_request(method: str, url: str, **kwargs: object) -> dict[str, object]:
        calls.append("called")
        return completion("A clipped answer", finish_reason="length")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "hello", _CONTEXT)
    assert result["response"] == "A clipped answer"
    assert result["degraded"] is False
    assert calls == ["called"]


def test_missing_usage_counts_zero_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)

    async def fake_request(method: str, url: str, **kwargs: object) -> dict[str, object]:
        return completion("Answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "hello", _CONTEXT)
    assert result["prompt_tokens"] == 0
    assert result["completion_tokens"] == 0


def test_a_non_mapping_body_uses_the_next_model(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)
    monkeypatch.setenv("LLM_FALLBACK_MODELS", "secondary")
    tried: list[str] = []

    async def fake_request(method: str, url: str, **kwargs: object) -> object:
        body = kwargs["json_body"]
        assert isinstance(body, dict)
        tried.append(str(body["model"]))
        if body["model"] == "primary":
            return ["not", "a", "completion", "mapping"]
        return completion("Recovered answer.")

    monkeypatch.setattr(ai_service, "request_json", fake_request)
    result = anyio.run(ai_service.generate_response, "hello", _CONTEXT)
    assert result["provider"] == "secondary"
    assert result["response"] == "Recovered answer."
    assert tried == ["primary", "secondary"]


def test_exhausted_total_budget_skips_every_model(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)
    monkeypatch.setenv("LLM_TOTAL_BUDGET_S", "1.0")
    monkeypatch.setattr(ai_service, "time", _FakeClock(iter([0.0, 2.0])))
    calls: list[str] = []

    async def unexpected(*args: object, **kwargs: object) -> dict[str, object]:
        calls.append("called")
        return completion("should not happen")

    monkeypatch.setattr(ai_service, "request_json", unexpected)
    result = anyio.run(ai_service.generate_response, "What is the AQI?", _CONTEXT)
    assert result["degraded"] is True
    assert "unreachable" in str(result["response"])
    assert calls == []
