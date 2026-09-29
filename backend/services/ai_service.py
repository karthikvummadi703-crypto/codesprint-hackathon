"""LLM orchestration for the environmental assistant.

Responsibilities kept in this module: prompt assembly, the provider call with
bounded retries and timing, history windowing, and a grounded offline response
for when the model is unreachable. Context *content* lives in `ai_context.py`.
"""

from __future__ import annotations

import asyncio
import time

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger

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

SYSTEM_PROMPT = """You are AirGuard AI, the environmental intelligence assistant of a climate-resilience platform built for the BRICS Clean Air & Climate Resilience challenge. You help citizens and local authorities understand air quality and weather at the location they have pinned on their dashboard, and act on it.

How to answer:
0. SCOPE FIRST: you are a general-purpose assistant that happens to be excellent at air quality and weather. The CONTEXT block is authoritative for ENVIRONMENTAL questions about the pinned location. It is not a whitelist and not a topic restriction. For ANY other question (history, science, maths, geography, coding, health trivia, general knowledge, or plain chat) answer directly and helpfully from your own knowledge. Never refuse a question, and never say you "cannot answer based on the provided context", merely because the question is not environmental. Keep such answers short and confident.
1. Answer the question that was actually asked, in 2-5 short sentences or a tight bullet list. Do not dump the user's whole dataset unless they asked for a summary. Be brief by default; a long preamble makes the chat feel slow.
2. Ground every ENVIRONMENTAL number in the CONTEXT block. The context is authoritative for the selected location.
3. State data provenance honestly. Measured readings, forecast model output and heuristic estimates are different things. Never present an estimate or a forecast as an observation, and never present a forecast as a guarantee.
4. If a piece of ENVIRONMENTAL data is missing or marked unavailable, say so plainly and answer from general knowledge with that caveat. Never invent a temperature, AQI reading, pollutant concentration or rain probability.
5. Weights matter: air quality tracks the selected location, so tailor to local conditions. Weigh wind (dispersion), humidity (secondary aerosol and haze), cloud cover (photochemistry), heat (ozone formation) and time of day.
6. Name vulnerable groups when risk is elevated: children, elderly, people with asthma or heart disease, outdoor workers, pregnant women.
7. Give actionable next steps: when to exercise, whether to run a filter or close windows, when to reschedule outdoor work. Be practical and concise.
8. Never give a medical diagnosis and never advise someone to ignore official health warnings. Recommend professional care for symptoms.
9. Rain does not reliably clear pollution. If someone expects rain to fix their air, correct that: rain scavenges particles but can also raise humidity and secondary aerosols.
10. If the user uploaded documents, ground the answer in them and say which document it came from.
11. Vary your phrasing. Do not open with the same sentence every time.
12. If the user asks about a different location, answer for that location and note that their dashboard is still pinned to the original selection."""

_HISTORY_TURNS = 10
_MAX_TURN_CHARS = 1200
_MAX_TOKENS_BUDGET = 6000


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
        messages.append({"role": "system", "content": f"CONTEXT (authoritative for the selected location):\n{context_text}"})
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

        payload = {
            "model": model,
            "messages": messages,
            "temperature": settings.llm_temperature,
            "max_tokens": settings.llm_max_tokens,
        }
        # Only sent when configured: a reasoning budget is an OpenRouter-shaped
        # parameter and a plain OpenAI endpoint rejects unknown body fields. It is
        # not only a speed knob. Left unset, a reasoning model over-applies the
        # "ground everything in CONTEXT" rule and refuses ordinary questions
        # ("I cannot answer that based on the provided context"), which reaches
        # the user as a dead assistant.
        if settings.llm_reasoning_effort:
            payload["reasoning"] = {"effort": settings.llm_reasoning_effort}
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
            continue

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            log.warning("llm returned an unexpected body shape model=%s", model)
            continue

        if not (content or "").strip():
            # Some reasoning endpoints answer 200 with no text and everything under
            # `reasoning`. Returning that blank would render an empty bubble, which
            # reads as a dead assistant, so try the next model instead.
            log.warning("llm returned empty content model=%s", model)
            continue

        _llm_succeeded()
        usage = data.get("usage") or {}
        return {
            "response": content.strip(),
            "provider": model,
            "degraded": False,
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
        }

    # Every model in the chain failed. Only now is a rate limit a property of this
    # deployment rather than of one upstream provider, so the breaker is charged
    # once for the whole chain instead of once per model.
    if rate_limited:
        _rate_limited(f"all {len(chain)} model(s) in the chain rate limited")
        reason = (
            "the language model's free-tier quota is used up for today, "
            "so it resets overnight"
        )
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


# --------------------------------------------------------------------------------------
# Grounded offline fallback
# --------------------------------------------------------------------------------------


def _is_unavailable(section: str) -> bool:
    """True when a context section is a placeholder, not data.

    The builder writes `WEATHER (now): unavailable — ...` when a provider is down.
    Without this check the offline reply would render that as a reading.
    """
    return not (section or "").strip() or "unavailable" in section.split("\n")[0].lower()


def _section_header(context_text: str, label: str) -> str:
    """Return the raw first line of a context section, tag included."""
    for block in (context_text or "").split("\n\n"):
        if block.strip().upper().startswith(label.upper()):
            return block.split("\n")[0]
    return ""


def _section(context_text: str, label: str) -> str:
    """Pull one context section back out for the offline reply.

    A section whose header line carries data inline (for example
    `AIR QUALITY (now) [...]: AQI 80 — Moderate`) keeps that remainder, so a
    single-line section is not silently reduced to an empty string. Multi-line
    sections still return their body below the header.
    """
    for block in (context_text or "").split("\n\n"):
        if not block.strip().upper().startswith(label.upper()):
            continue
        lines = block.split("\n")
        header = lines[0]
        body = "\n".join(lines[1:]).strip()
        # Text after the label's closing bracket/paren belongs to the header.
        # The label may itself contain a colon, and the provenance tag may
        # contain one too (e.g. "[measured, provider: open-meteo]"), so the
        # split point is found after the provenance bracket when there is one.
        inline = ""
        if "]" in header:
            _, _, after_bracket = header.partition("]")
            after_bracket = after_bracket.strip()
            if after_bracket.startswith(":"):
                inline = after_bracket[1:].strip()
        elif ": " in header:
            inline = header.split(": ", 1)[1].strip()
        return f"{inline}\n{body}".strip() if inline else body
    return ""


def _field(text: str, label: str) -> str:
    for line in text.split("\n"):
        if line.strip().upper().startswith(label.upper()):
            return line.split(":", 1)[-1].strip()
    return ""


def _aqi_from_context(context_text: str) -> int | None:
    import re

    block = _section(context_text, "AIR QUALITY (NOW)")
    match = re.search(r"AQI\s+(\d+)", block)
    return int(match.group(1)) if match else None


def fallback_response(message: str, context_text: str, reason: str = "the language model is unavailable") -> str:
    """Answer from the context block only — never from invented data.

    This runs when the LLM cannot be reached, so it reads the same context the
    model would have seen and stays honest about what it does not know.
    """
    from services import query_router as qr

    intent = qr.classify(message)
    aqi = _aqi_from_context(context_text)
    # `_section` already returns the text that followed the label, so the place
    # is its first line. Reading it back through `_field` would look for a line
    # starting with the label, which is no longer there.
    location_lines = _section(context_text, "SELECTED LOCATION").splitlines()
    place = location_lines[0].strip().rstrip(".") if location_lines else "the selected location"
    weather_now = _section(context_text, "WEATHER (NOW)")
    weather_forecast = _section(context_text, "WEATHER (FORECAST)")
    aqi_forecast = _section(context_text, "AIR QUALITY (FORECAST)")

    if intent == "greeting":
        return (
            f"I'm AirGuard AI, monitoring air quality and weather for {place}. I can tell you the "
            "current conditions, the outlook for the next few days, whether it is safe to be "
            "outdoors, and how your logged travel adds up. Note: I'm answering from a local "
            "fallback because the language model is unavailable right now."
        )

    if intent in {"weather", "rain"}:
        # A section that says "unavailable" is not data. Reading it as a reading
        # would produce "Right now in Hyderabad: unavailable".
        if weather_now and not _is_unavailable(weather_now):
            current = weather_now.splitlines()[0].strip().rstrip(".")
            parts = [f"Right now in {place}: {current}."]
            if weather_forecast and not _is_unavailable(weather_forecast):
                rows = [line.lstrip("- ").strip() for line in weather_forecast.split("\n") if line.strip()]
                parts.append("Outlook: " + "; ".join(rows[:3]) + ".")
            parts.append(f"(Live model unavailable — {reason}; showing stored forecast data.)")
            return " ".join(parts)
        if weather_forecast and not _is_unavailable(weather_forecast):
            rows = [line.lstrip("- ").strip() for line in weather_forecast.split("\n") if line.strip()]
            return f"Forecast for {place}: " + "; ".join(rows[:4]) + f". (Live model unavailable — {reason}.)"
        return f"I could not retrieve weather for {place} right now, so I won't guess. Please retry shortly."

    if intent in {"air_quality", "forecast"}:
        aqi_now = _section(context_text, "AIR QUALITY (NOW)")
        if aqi is not None and not _is_unavailable(aqi_now):
            now_line = aqi_now.splitlines()[0].strip().rstrip(".")
            # An estimate is not an observation. The provenance tag lives in the
            # section header, so read it from the context rather than the body.
            qualifier = ""
            if "modelled" in _section_header(context_text, "AIR QUALITY (NOW)").lower():
                qualifier = " (modelled estimate, not a measurement)"
            answer = f"Current reading for {place}: {now_line}{qualifier}."
            if aqi_forecast and not _is_unavailable(aqi_forecast):
                summary = aqi_forecast.splitlines()[0].strip().rstrip(".")
                answer += f" {summary}."
            answer += f" (Live model unavailable — {reason}.)"
            return answer
        return f"No AQI measurement is available for {place} at the moment, so I can't give you a number. Please retry shortly."

    if intent in {"safety", "combined"}:
        if aqi is None:
            return (
                f"I don't have a current AQI reading for {place}, so I can't responsibly say whether "
                f"outdoor activity is safe. Please retry shortly. (Live model unavailable — {reason}.)"
            )
        if aqi <= 50:
            verdict = "Air quality is good — normal outdoor activity for everyone."
        elif aqi <= 100:
            verdict = "Air quality is moderate; most people can be active outdoors, sensitive individuals should pace themselves."
        elif aqi <= 150:
            verdict = "Air quality is unhealthy for sensitive groups — children, elderly, and people with asthma or heart conditions should shorten or move activity indoors."
        else:
            verdict = "Air quality is unhealthy for everyone — move exercise indoors and use an N95-style mask if you must go out."
        extra = f" {weather_now.splitlines()[1]}" if len(weather_now.splitlines()) > 1 else ""
        return f"{verdict} Current AQI is {aqi} in {place}.{extra} (Live model unavailable — {reason}.)"

    if intent == "carbon":
        carbon = _section(context_text, "CARBON RECORD") or "no travel trips logged yet"
        first = carbon.split("\n")[0] if carbon else ""
        return (
            f"{first or 'No travel trips logged yet.'} The highest-impact change is usually switching short "
            f"commutes to bus, train or EV. (Live model unavailable — {reason}.)"
        )

    if intent == "documents":
        docs = _section(context_text, "RETRIEVED USER DOCUMENTS")
        # Drop the "excerpt N from <file>" provenance lines so the reply reads as
        # prose, but keep the content itself. Taking only the line after the first
        # would silently discard excerpt 1 whenever the first body line is its
        # own label.
        body = [
            line
            for line in docs.split("\n")
            if line.strip() and not line.strip().startswith("[excerpt ")
        ]
        if body:
            return (
                "From your uploaded documents: "
                + " ".join(body)[:600]
                + f"… (Live model unavailable — {reason}.)"
            )
        return f"No uploaded documents are available to draw on for {place} yet. (Live model unavailable — {reason}.)"

    if intent == "cause":
        dominant_block = _section(context_text, "DOMINANT POLLUTANT")
        dominant = dominant_block.splitlines()[0].strip().rstrip(".") if dominant_block else "n/a"
        return (
            f"The dominant pollutant in {place} is {dominant}. Typical local drivers are road traffic and "
            "resuspended dust for particulates, traffic and industry for NO₂, and sunlight-driven chemistry "
            "for ozone. Weather matters too: weak wind traps pollution. Attributing a specific source needs "
            f"local sensor data. (Live model unavailable — {reason}.)"
        )

    if intent == "comparison":
        history_block = _section(context_text, "RECENT AQI HISTORY")
        rows = [line.lstrip("- ") for line in history_block.split("\n")[1:] if line.strip()] if history_block else []
        if rows:
            return "Your recent readings for " + place + ": " + "; ".join(rows[:5]) + f". (Live model unavailable — {reason}.)"
        return (
            f"I don't have enough stored history for {place} yet to make a comparison — readings accumulate "
            f"as you use the dashboard. (Live model unavailable — {reason}.)"
        )

    summary_bits = []
    if aqi is not None:
        summary_bits.append(f"current AQI {aqi}")
    if weather_now and not _is_unavailable(weather_now):
        summary_bits.append(weather_now.splitlines()[0].strip().rstrip("."))
    headline = "; ".join(summary_bits) if summary_bits else "no live readings stored yet"
    return (
        f"I'm running in offline mode for {place} right now, so I can only report the readings I have "
        f"locally rather than answer open questions. What I do have: {headline}. "
        "I can answer anything about air quality, weather, forecasts, safety advice and your uploaded "
        "documents as soon as the live model is reachable again — please try again in a moment."
    )


def measure() -> float:
    return time.perf_counter()
