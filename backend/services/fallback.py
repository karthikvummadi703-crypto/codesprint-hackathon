"""Grounded offline fallback replies used when the LLM cannot be reached."""

from __future__ import annotations

import time

from services import query_router as qr


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


def _greeting_reply(place: str) -> str:
    return (
        f"I'm AirGuard AI, monitoring air quality and weather for {place}. I can tell you the "
        "current conditions, the outlook for the next few days, whether it is safe to be "
        "outdoors, and how your logged travel adds up. Note: I'm answering from a local "
        "fallback because the language model is unavailable right now."
    )


def _weather_reply(place: str, reason: str, weather_now: str, weather_forecast: str) -> str:
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


def _air_reply(place: str, reason: str, context_text: str, aqi: int | None, aqi_forecast: str) -> str:
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


def _safety_reply(place: str, reason: str, aqi: int | None, weather_now: str) -> str:
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


def _carbon_reply(reason: str, context_text: str) -> str:
    carbon = _section(context_text, "CARBON RECORD") or "no travel trips logged yet"
    first = carbon.split("\n")[0] if carbon else ""
    return (
        f"{first or 'No travel trips logged yet.'} The highest-impact change is usually switching short "
        f"commutes to bus, train or EV. (Live model unavailable — {reason}.)"
    )


def _documents_reply(place: str, reason: str, context_text: str) -> str:
    docs = _section(context_text, "RETRIEVED USER DOCUMENTS")
    # Drop the "excerpt N from <file>" provenance lines so the reply reads as
    # prose, but keep the content itself. Taking only the line after the first
    # would silently discard excerpt 1 whenever the first body line is its
    # own label.
    body = [line for line in docs.split("\n") if line.strip() and not line.strip().startswith("[excerpt ")]
    if body:
        return (
            "From your uploaded documents: "
            + " ".join(body)[:600]
            + f"… (Live model unavailable — {reason}.)"
        )
    return f"No uploaded documents are available to draw on for {place} yet. (Live model unavailable — {reason}.)"


def _cause_reply(place: str, reason: str, context_text: str) -> str:
    dominant_block = _section(context_text, "DOMINANT POLLUTANT")
    dominant = dominant_block.splitlines()[0].strip().rstrip(".") if dominant_block else "n/a"
    return (
        f"The dominant pollutant in {place} is {dominant}. Typical local drivers are road traffic and "
        "resuspended dust for particulates, traffic and industry for NO₂, and sunlight-driven chemistry "
        "for ozone. Weather matters too: weak wind traps pollution. Attributing a specific source needs "
        f"local sensor data. (Live model unavailable — {reason}.)"
    )


def _comparison_reply(place: str, reason: str, context_text: str) -> str:
    history_block = _section(context_text, "RECENT AQI HISTORY")
    rows = (
        [line.lstrip("- ") for line in history_block.split("\n")[1:] if line.strip()] if history_block else []
    )
    if rows:
        return (
            "Your recent readings for "
            + place
            + ": "
            + "; ".join(rows[:5])
            + f". (Live model unavailable — {reason}.)"
        )
    return (
        f"I don't have enough stored history for {place} yet to make a comparison — readings accumulate "
        f"as you use the dashboard. (Live model unavailable — {reason}.)"
    )


def _general_reply(place: str, aqi: int | None, weather_now: str) -> str:
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


def fallback_response(
    message: str, context_text: str, reason: str = "the language model is unavailable"
) -> str:
    """Answer from the context block only — never from invented data.

    This runs when the LLM cannot be reached, so it reads the same context the
    model would have seen and stays honest about what it does not know.
    """
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
        return _greeting_reply(place)

    if intent in {"weather", "rain"}:
        # A section that says "unavailable" is not data. Reading it as a reading
        # would produce "Right now in Hyderabad: unavailable".
        return _weather_reply(place, reason, weather_now, weather_forecast)

    if intent in {"air_quality", "forecast"}:
        return _air_reply(place, reason, context_text, aqi, aqi_forecast)

    if intent in {"safety", "combined"}:
        return _safety_reply(place, reason, aqi, weather_now)

    if intent == "carbon":
        return _carbon_reply(reason, context_text)

    if intent == "documents":
        return _documents_reply(place, reason, context_text)

    if intent == "cause":
        return _cause_reply(place, reason, context_text)

    if intent == "comparison":
        return _comparison_reply(place, reason, context_text)

    return _general_reply(place, aqi, weather_now)


def measure() -> float:
    return time.perf_counter()
