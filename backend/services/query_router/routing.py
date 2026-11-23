"""Deterministic intent classification and context-block selection."""

from __future__ import annotations

from services.query_router.blocks import (
    _BLOCKS,
    BLOCK_AQI_NOW,
    BLOCK_DOCUMENTS,
    BLOCK_LOCATION,
    BLOCK_VULNERABILITY,
    BLOCK_WEATHER_FORECAST,
    BLOCK_WEATHER_NOW,
)
from services.query_router.documents import _ENV_TERMS, mentions_documents
from services.query_router.history import wants_historical

# Ordered: the first matching rule wins, so put the specific phrases first.
_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "greeting",
        (
            "hello", "hi ", "hi there", "hey", "good morning", "good afternoon",
            "good evening", "how are you", "who are you", "what can you do",
            "your name", "thanks", "thank you",
        ),
    ),
    (
        "rain",
        (
            "rain", "raining", "rainfall", "precipitation", "shower", "umbrella",
            "wet", "drizzle", "humid", "monsoon", "thunderstorm", "storm", "snow",
        ),
    ),
    (
        "weather",
        (
            "weather", "temperature", "hot", "cold", "wind", "humidity", "forecast",
            "sunny", "cloud", "visibility", "uv", "heat", "chilly", "degree",
        ),
    ),
    (
        "safety",
        (
            "safe to go", "safe outside", "is it safe", "go outside", "outdoor",
            "exercise", "jog", "run", "walk", "children", "kids", "elderly",
            "asthma", "breathe", "sensitive group", "mask", "allergy",
            "allergen", "health", "vulnerable",
        ),
    ),
    (
        "carbon",
        (
            "carbon", "co2", "co2e", "footprint", "emission", "greenhouse",
            "commute", "trip", "travel", "flight", "transit",
        ),
    ),
    (
        "documents",
        (
            "document", "upload", "report", "pdf", "my file", "csv", "knowledge base",
            "my data", "attached",
        ),
    ),
    (
        "comparison",
        (
            "compare", "compared", "versus", "vs ", "difference", "yesterday",
            "last week", "change", "trend", "history", "historical", "since",
        ),
    ),
    (
        "cause",
        (
            "why", "cause", "reason", "source of", "who emits", "where does",
            "coming from", "attribution", "because of",
        ),
    ),
    (
        "forecast",
        (
            "tomorrow", "tonight", "next 24", "next 48", "next few days", "outlook",
            "will aqi", "going to", "expected", "coming hours", "later",
        ),
    ),
    (
        "air_quality",
        (
            "aqi", "air quality", "pollution", "pollutant", "pm2.5", "pm10", "no2",
            "so2", "ozone", "o3", "particulate", "smog", "how bad", "air",
        ),
    ),
)

# A question that mentions both weather and air quality needs both datasets.
_COMBINED_TRIGGERS = (
    ("weather", "air quality"),
    ("weather", "pollution"),
    ("weather", "aqi"),
    ("rain", "pollution"),
    ("rain", "air quality"),
    ("wind", "pollution"),
    ("wind", "aqi"),
    ("humidity", "pollution"),
    ("temperature", "pollution"),
)


def classify(message: str) -> str:
    """Return the intent name for a user message."""
    lowered = f" {message.lower().strip()} "
    for trigger_a, trigger_b in _COMBINED_TRIGGERS:
        if trigger_a in lowered and trigger_b in lowered:
            return "combined"
    # A document reference plus an environmental topic is a two-part question:
    # it needs retrieved excerpts *and* live data, in one prompt.
    if mentions_documents(lowered) and any(term in lowered for term in _ENV_TERMS):
        return "document_context"
    # A question anchored to a past period (a year, a month, "last summer") needs
    # observed history, not the intra-day trend the comparison rule would fetch.
    if wants_historical(lowered):
        return "historical"
    for name, keywords in _RULES:
        if any(keyword in lowered for keyword in keywords):
            return name
    return "general"


def blocks_for(intent: str) -> tuple[str, ...]:
    if intent == "combined":
        return (
            BLOCK_LOCATION,
            BLOCK_AQI_NOW,
            BLOCK_WEATHER_NOW,
            BLOCK_WEATHER_FORECAST,
            BLOCK_VULNERABILITY,
        )
    if intent == "document_context":
        # Retrieved excerpts *and* live readings, so "compare the report with
        # current conditions" can actually be answered.
        return (
            BLOCK_LOCATION,
            BLOCK_DOCUMENTS,
            BLOCK_AQI_NOW,
            BLOCK_WEATHER_NOW,
            BLOCK_WEATHER_FORECAST,
            BLOCK_VULNERABILITY,
        )
    return _BLOCKS.get(intent, _BLOCKS["general"])


def wants_documents(intent: str) -> bool:
    return BLOCK_DOCUMENTS in blocks_for(intent)


def wants_location(intent: str) -> bool:
    return BLOCK_LOCATION in blocks_for(intent)
