"""Query classification for the environmental assistant.

Deterministic, keyword-based routing so that a question about tomorrow's rainfall
never pays for AQI history and a document question never pays for a weather call.
Each intent declares which context blocks are worth fetching, which is what keeps
prompt size proportional to the question.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Context blocks the prompt builder can include.
BLOCK_WEATHER_NOW = "weather_now"
BLOCK_WEATHER_FORECAST = "weather_forecast"
BLOCK_AQI_NOW = "aqi_now"
BLOCK_AQI_FORECAST = "aqi_forecast"
BLOCK_AQI_HISTORY = "aqi_history"
BLOCK_CARBON = "carbon"
BLOCK_DOCUMENTS = "documents"
BLOCK_LOCATION = "location"
BLOCK_VULNERABILITY = "vulnerability"
BLOCK_ACTIVITY = "activity_guidance"
BLOCK_CAUSE = "cause_context"

_ALL_ENVIRONMENTAL = (
    BLOCK_LOCATION,
    BLOCK_AQI_NOW,
    BLOCK_AQI_FORECAST,
    BLOCK_AQI_HISTORY,
    BLOCK_VULNERABILITY,
)


@dataclass(frozen=True)
class Intent:
    name: str
    blocks: tuple[str, ...] = field(default_factory=tuple)


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

# What each intent actually needs in the prompt.
_BLOCKS: dict[str, tuple[str, ...]] = {
    "greeting": (BLOCK_LOCATION,),
    "weather": (BLOCK_LOCATION, BLOCK_WEATHER_NOW, BLOCK_WEATHER_FORECAST),
    "rain": (BLOCK_LOCATION, BLOCK_WEATHER_NOW, BLOCK_WEATHER_FORECAST),
    "air_quality": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_AQI_FORECAST),
    "forecast": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_AQI_FORECAST, BLOCK_WEATHER_FORECAST),
    "safety": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_WEATHER_NOW, BLOCK_VULNERABILITY, BLOCK_ACTIVITY),
    "cause": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_WEATHER_NOW, BLOCK_CAUSE),
    "comparison": (BLOCK_LOCATION, BLOCK_AQI_HISTORY, BLOCK_WEATHER_FORECAST),
    "carbon": (BLOCK_LOCATION, BLOCK_CARBON),
    "documents": (BLOCK_DOCUMENTS,),
    "general": _ALL_ENVIRONMENTAL,
}

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


# --------------------------------------------------------------------------------------
# Document-aware routing
# --------------------------------------------------------------------------------------

# Words that refer to something the user uploaded. Checked separately from the
# ordered rules so that "compare the document findings with current conditions"
# can be recognised as a document *and* environment question: the ordered rules
# would otherwise stop at "documents" and the model would never see live data to
# compare against.
_DOC_TERMS = (
    "document", "report", "pdf", "uploaded", "upload", "attachment", "attached",
    "my file", "the file", "this file", "knowledge base", "csv",
)

# Questions about a document as a whole, which relevance ranking cannot answer.
_SUMMARY_TERMS = (
    "summarise", "summarize", "summary", "overview of", "key findings",
    "main findings", "important findings", "what is in this", "what does it say",
    "explain the", "describe the", "highlight", "takeaways", "conclusion",
)

# An environmental topic appearing alongside a document reference.
_ENV_TERMS = (
    "weather", "temperature", "rain", "rainfall", "humidity", "wind", "forecast",
    "aqi", "air quality", "pollution", "pollutant", "pm2.5", "pm10", "no2", "o3",
    "outdoor", "safe", "health", "compare", "current conditions", "now", "today",
)


def mentions_documents(message: str) -> bool:
    lowered = f" {message.lower().strip()} "
    return any(term in lowered for term in _DOC_TERMS)


def is_summary_request(message: str) -> bool:
    lowered = f" {message.lower().strip()} "
    return any(term in lowered for term in _SUMMARY_TERMS)
