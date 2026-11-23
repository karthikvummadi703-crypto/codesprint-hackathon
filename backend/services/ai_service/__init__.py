"""LLM orchestration for the environmental assistant.

Responsibilities kept here: rate-limit breaker state, the public surface and the
wiring between prompt assembly, provider calls and the grounded offline reply.
Context *content* lives in `ai_context.py`.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from config import Settings, get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger
from services.ai_service import fallback as _fallback
from services.ai_service import prompt as _prompt
from services.ai_service import provider as _provider

log = get_logger("airguard.ai")

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

_rate_limit_streak = 0
_rate_limit_open_until = 0.0
_breaker_lock = asyncio.Lock()


def _rate_limited(reason: str) -> None:
    global _rate_limit_streak, _rate_limit_open_until
    _rate_limit_streak += 1
    if _rate_limit_streak >= _RATE_LIMIT_THRESHOLD:
        _rate_limit_open_until = time.monotonic() + _RATE_LIMIT_COOLDOWN_S
        log.warning(
            "llm breaker open after %d rate limits; grounded fallback for %ds (last: %s)",
            _rate_limit_streak,
            int(_RATE_LIMIT_COOLDOWN_S),
            reason,
        )


def _llm_succeeded() -> None:
    global _rate_limit_streak, _rate_limit_open_until
    _rate_limit_streak = 0
    _rate_limit_open_until = 0.0


def _breaker_is_open() -> bool:
    return time.monotonic() < _rate_limit_open_until


def reset_breaker() -> None:
    """Clear breaker state. Used by tests and on settings change."""
    global _rate_limit_streak, _rate_limit_open_until
    _rate_limit_streak = 0
    _rate_limit_open_until = 0.0


SYSTEM_PROMPT = _prompt.SYSTEM_PROMPT
_HISTORY_TURNS = _prompt._HISTORY_TURNS
_MAX_TURN_CHARS = _prompt._MAX_TURN_CHARS
_MAX_TOKENS_BUDGET = _prompt._MAX_TOKENS_BUDGET
_REASONING_MIN_OUTPUT_TOKENS = _prompt._REASONING_MIN_OUTPUT_TOKENS
_MAX_OUTPUT_TOKENS = _prompt._MAX_OUTPUT_TOKENS


def _output_token_budget(settings: Settings) -> int:
    budget = settings.llm_max_tokens
    if settings.llm_reasoning_effort:
        budget = max(budget, _REASONING_MIN_OUTPUT_TOKENS)
    return int(budget)


def _history_messages(history: list[dict] | None) -> list[dict]:
    return _prompt._history_messages(history)


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

    return await _provider.generate_response(
        message=message,
        context_text=context_text,
        history=history,
        settings=settings,
        system_prompt=SYSTEM_PROMPT,
        history_messages=_history_messages,
        deps={
            "output_token_budget": _output_token_budget,
            "request_json": request_json,
            "log": log,
            "time_module": time,
            "no_retry_statuses": _LLM_NO_RETRY_STATUS,
            "max_output_tokens": _MAX_OUTPUT_TOKENS,
            "on_success": _llm_succeeded,
            "on_rate_limit": _rate_limited,
            "degraded": _degraded,
        },
    )


def _degraded(message: str, context_text: str, reason: str) -> dict:
    return _fallback.degraded_response(message, context_text, reason, fallback_response)


def fallback_response(message: str, context_text: str, reason: str = "the language model is unavailable") -> str:
    """Answer from the context block only — never from invented data."""
    return _fallback.fallback_response(message, context_text, reason)


_is_unavailable = _fallback._is_unavailable
_section_header = _fallback._section_header
_section = _fallback._section
_field = _fallback._field
_aqi_from_context = _fallback._aqi_from_context


def measure() -> float:
    return time.perf_counter()


__all__ = [
    "SYSTEM_PROMPT",
    "_MAX_OUTPUT_TOKENS",
    "_MAX_TOKENS_BUDGET",
    "_MAX_TURN_CHARS",
    "_RATE_LIMIT_COOLDOWN_S",
    "_RATE_LIMIT_THRESHOLD",
    "_REASONING_MIN_OUTPUT_TOKENS",
    "ProviderError",
    "_aqi_from_context",
    "_breaker_is_open",
    "_breaker_lock",
    "_degraded",
    "_field",
    "_history_messages",
    "_is_unavailable",
    "_llm_succeeded",
    "_output_token_budget",
    "_rate_limit_open_until",
    "_rate_limit_streak",
    "_rate_limited",
    "_section",
    "_section_header",
    "asyncio",
    "fallback_response",
    "generate_response",
    "get_logger",
    "get_settings",
    "log",
    "measure",
    "request_json",
    "reset_breaker",
    "time",
]
