"""LLM orchestration for the environmental assistant.

Responsibilities kept in this module: prompt assembly, the provider call with
bounded retries and timing, history windowing, and a grounded offline response
for when the model is unreachable. Context *content* lives in `ai_context.py`.
"""

from __future__ import annotations

import time

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger
from prompts import SYSTEM_PROMPT
from services.fallback import (
    _aqi_from_context as _aqi_from_context,
)
from services.fallback import (
    _field as _field,
)
from services.fallback import (
    _is_unavailable as _is_unavailable,
)
from services.fallback import (
    _section as _section,
)
from services.fallback import (
    _section_header as _section_header,
)
from services.fallback import (
    fallback_response as fallback_response,
)
from services.fallback import (
    measure as measure,
)
from services.llm_breaker import CircuitBreaker

log = get_logger("airguard.ai")

__all__ = [
    "SYSTEM_PROMPT",
    "_aqi_from_context",
    "_field",
    "_is_unavailable",
    "_section",
    "_section_header",
    "fallback_response",
    "generate_response",
    "measure",
    "reset_breaker",
]

# Retrying a shared free-tier model right after a 429 waits out the backoff and
# still fails, so the LLM call never retries a rate limit. Everything else (5xx,
# timeouts) still gets one retry.
_LLM_NO_RETRY_STATUS = frozenset({408, 425, 500, 502, 503, 504})

# When every model is rate limited there is no point paying the round trip on
# each message, so repeated total failures open a short breaker that routes
# straight to the grounded fallback. The breaker is only a speed optimisation:
# the grounded fallback still answers, so the window is kept short and the next
# request after it elapses acts as a probe that closes the breaker on success.
_RATE_LIMIT_THRESHOLD = 3
_RATE_LIMIT_COOLDOWN_S = 30.0

breaker = CircuitBreaker(threshold=_RATE_LIMIT_THRESHOLD, cooldown_s=_RATE_LIMIT_COOLDOWN_S)


def _rate_limited(reason: str) -> None:
    breaker.record_rate_limit(reason)


def _llm_succeeded() -> None:
    breaker.record_success()


def _breaker_is_open() -> bool:
    return breaker.is_open()


def reset_breaker() -> None:
    """Clear breaker state. Used by tests and on settings change."""
    breaker.reset()


_HISTORY_TURNS = 10
_MAX_TURN_CHARS = 1200
_MAX_TOKENS_BUDGET = 6000

# Reasoning models spend part of `max_tokens` on hidden thinking. A cap that looks
# reasonable for a plain chat model (400) leaves almost nothing for the visible
# answer, and the provider returns a half-sentence with finish_reason="length".
# Give those models real headroom, and retry once with a larger cap if a provider
# still truncates so the user never sees a clipped answer.
_REASONING_MIN_OUTPUT_TOKENS = 1600
_MAX_OUTPUT_TOKENS = 4000


def _output_token_budget(settings) -> int:
    budget = settings.llm_max_tokens
    if settings.llm_reasoning_effort:
        budget = max(budget, _REASONING_MIN_OUTPUT_TOKENS)
    return budget


def _history_messages(history: list[dict] | None) -> list[dict]:
    """Recent turns only, newest-first trimmed, oldest-first ordered.

    A budget loop is used so that a single long turn cannot crowd out the rest of
    the conversation.
    """
    cleaned: list[dict] = []
    for turn in (history or [])[-_HISTORY_TURNS:]:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        cleaned.append({"role": role, "content": content[:_MAX_TURN_CHARS]})

    total = sum(len(t["content"]) for t in cleaned)
    while cleaned and total > _MAX_TOKENS_BUDGET:
        dropped = cleaned.pop(0)
        total -= len(dropped["content"])
    return cleaned


async def generate_response(message: str, context_text: str, history: list | None = None) -> dict:
    """Call the chat-completions provider.

    Returns a dict with the reply plus provider/degraded metadata so the route can
    report timing and token usage without re-deriving them.
    """
    settings = get_settings()
    if not settings.llm_configured:
        return _degraded(message, context_text, "the language model is not configured")

    if _breaker_is_open():
        return _degraded(message, context_text, "the language model is rate limited right now")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context_text:
        messages.append(
            {
                "role": "system",
                "content": f"CONTEXT (authoritative for the selected location):\n{context_text}",
            }
        )
    messages.extend(_history_messages(history))
    messages.append({"role": "user", "content": message})

    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }

    chain = settings.llm_model_chain or ((settings.llm_model,) if settings.llm_model else ())
    if not chain:
        return _degraded(message, context_text, "the language model is not configured")

    rate_limited = False
    # The chain is only a latency win while it stays inside one interaction. A
    # deadline bounds the total, so four slow models cannot add up to four
    # timeouts before the user gets the grounded answer.
    budget_s = max(1.0, settings.llm_total_budget_s)
    started = time.perf_counter()

    for model in chain:
        remaining = budget_s - (time.perf_counter() - started)
        if remaining <= 0.5:
            log.warning("llm budget exhausted after %d/%d models", chain.index(model), len(chain))
            break

        max_tokens = _output_token_budget(settings)
        payload = {
            "model": model,
            "messages": messages,
            "temperature": settings.llm_temperature,
            "max_tokens": max_tokens,
        }
        # Only sent when configured: a reasoning budget is an OpenRouter-shaped
        # parameter and a plain OpenAI endpoint rejects unknown body fields. It is
        # not only a speed knob. Left unset, a reasoning model over-applies the
        # "ground everything in CONTEXT" rule and refuses ordinary questions
        # ("I cannot answer that based on the provided context"), which reaches
        # the user as a dead assistant.
        if settings.llm_reasoning_effort:
            payload["reasoning"] = {"effort": settings.llm_reasoning_effort}

        truncated_retry = False
        while True:
            remaining = budget_s - (time.perf_counter() - started)
            if remaining <= 0.5:
                break
            try:
                data = await request_json(
                    "POST",
                    f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                    provider="llm",
                    json_body=payload,
                    headers=headers,
                    timeout=min(settings.llm_timeout_s, remaining),
                    retries=1,
                    retry_statuses=_LLM_NO_RETRY_STATUS,
                )
            except ProviderError as exc:
                # A rate limit or a 5xx on one free-tier model says nothing about the
                # next one, so the chain continues instead of giving up here.
                log.warning("llm call failed model=%s: %s", model, exc)
                if exc.status == 429:
                    rate_limited = True
                break

            try:
                choice = data["choices"][0]
                content = choice["message"]["content"]
            except (KeyError, IndexError, TypeError):
                log.warning("llm returned an unexpected body shape model=%s", model)
                break

            if choice.get("finish_reason") == "length" and not truncated_retry:
                if max_tokens >= _MAX_OUTPUT_TOKENS:
                    log.warning("llm output still truncated at the maximum budget model=%s", model)
                elif remaining > 1.0:
                    truncated_retry = True
                    max_tokens = min(max_tokens * 2, _MAX_OUTPUT_TOKENS)
                    payload = {**payload, "max_tokens": max_tokens}
                    log.warning(
                        "llm output truncated model=%s; retrying with max_tokens=%d",
                        model,
                        max_tokens,
                    )
                    continue

            if not (content or "").strip():
                # Some reasoning endpoints answer 200 with no text and everything under
                # `reasoning`. Returning that blank would render an empty bubble, which
                # reads as a dead assistant, so try the next model instead.
                log.warning("llm returned empty content model=%s", model)
                break

            _llm_succeeded()
            usage = data.get("usage") or {}
            return {
                "response": content.strip(),
                "provider": model,
                "degraded": False,
                "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                "completion_tokens": int(usage.get("completion_tokens") or 0),
            }
        # The inner loop ends when this model cannot produce a usable answer; the
        # outer chain then gets a chance with the next model.

    # Every model in the chain failed. Only now is a rate limit a property of this
    # deployment rather than of one upstream provider, so the breaker is charged
    # once for the whole chain instead of once per model.
    if rate_limited:
        _rate_limited(f"all {len(chain)} model(s) in the chain rate limited")
        reason = "the language model's free-tier quota is used up for today, so it resets overnight"
    else:
        reason = "the language model is unreachable"
    return _degraded(message, context_text, reason)


def _degraded(message: str, context_text: str, reason: str) -> dict:
    """Grounded offline reply shaped like a successful provider response."""
    return {
        "response": fallback_response(message, context_text, reason=reason),
        "provider": "grounded-fallback",
        "degraded": True,
        "prompt_tokens": 0,
        "completion_tokens": 0,
    }
