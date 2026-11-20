"""Query classification for the environmental assistant.

Deterministic, keyword-based routing so that a question about tomorrow's rainfall
never pays for AQI history and a document question never pays for a weather call.
Each intent declares which context blocks are worth fetching, which is what keeps
prompt size proportional to the question.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

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
            "hello",
            "hi ",
            "hi there",
            "hey",
            "good morning",
            "good afternoon",
            "good evening",
            "how are you",
            "who are you",
            "what can you do",
            "your name",
            "thanks",
            "thank you",
        ),
    ),
    (
        "rain",
        (
            "rain",
            "raining",
            "rainfall",
            "precipitation",
            "shower",
            "umbrella",
            "wet",
            "drizzle",
            "humid",
            "monsoon",
            "thunderstorm",
            "storm",
            "snow",
        ),
    ),
    (
        "weather",
        (
            "weather",
            "temperature",
            "hot",
            "cold",
            "wind",
            "humidity",
            "forecast",
            "sunny",
            "cloud",
            "visibility",
            "uv",
            "heat",
            "chilly",
            "degree",
        ),
    ),
    (
        "safety",
        (
            "safe to go",
            "safe outside",
            "is it safe",
            "go outside",
            "outdoor",
            "exercise",
            "jog",
            "run",
            "walk",
            "children",
            "kids",
            "elderly",
            "asthma",
            "breathe",
            "sensitive group",
            "mask",
            "allergy",
            "allergen",
            "health",
            "vulnerable",
        ),
    ),
    (
        "carbon",
        (
            "carbon",
            "co2",
            "co2e",
            "footprint",
            "emission",
            "greenhouse",
            "commute",
            "trip",
            "travel",
            "flight",
            "transit",
        ),
    ),
    (
        "documents",
        (
            "document",
            "upload",
            "report",
            "pdf",
            "my file",
            "csv",
            "knowledge base",
            "my data",
            "attached",
        ),
    ),
    (
        "comparison",
        (
            "compare",
            "compared",
            "versus",
            "vs ",
            "difference",
            "yesterday",
            "last week",
            "change",
            "trend",
            "history",
            "historical",
            "since",
        ),
    ),
    (
        "cause",
        (
            "why",
            "cause",
            "reason",
            "source of",
            "who emits",
            "where does",
            "coming from",
            "attribution",
            "because of",
        ),
    ),
    (
        "forecast",
        (
            "tomorrow",
            "tonight",
            "next 24",
            "next 48",
            "next few days",
            "outlook",
            "will aqi",
            "going to",
            "expected",
            "coming hours",
            "later",
        ),
    ),
    (
        "air_quality",
        (
            "aqi",
            "air quality",
            "pollution",
            "pollutant",
            "pm2.5",
            "pm10",
            "no2",
            "so2",
            "ozone",
            "o3",
            "particulate",
            "smog",
            "how bad",
            "air",
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
    "historical": (BLOCK_LOCATION, BLOCK_AQI_HISTORY, BLOCK_AQI_NOW),
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


# --------------------------------------------------------------------------------------
# Document-aware routing
# --------------------------------------------------------------------------------------

# Words that refer to something the user uploaded. Checked separately from the
# ordered rules so that "compare the document findings with current conditions"
# can be recognised as a document *and* environment question: the ordered rules
# would otherwise stop at "documents" and the model would never see live data to
# compare against.
_DOC_TERMS = (
    "document",
    "report",
    "pdf",
    "uploaded",
    "upload",
    "attachment",
    "attached",
    "my file",
    "the file",
    "this file",
    "knowledge base",
    "csv",
)

# Questions about a document as a whole, which relevance ranking cannot answer.
_SUMMARY_TERMS = (
    "summarise",
    "summarize",
    "summary",
    "overview of",
    "key findings",
    "main findings",
    "important findings",
    "what is in this",
    "what does it say",
    "explain the",
    "describe the",
    "highlight",
    "takeaways",
    "conclusion",
)

# An environmental topic appearing alongside a document reference.
_ENV_TERMS = (
    "weather",
    "temperature",
    "rain",
    "rainfall",
    "humidity",
    "wind",
    "forecast",
    "aqi",
    "air quality",
    "pollution",
    "pollutant",
    "pm2.5",
    "pm10",
    "no2",
    "o3",
    "outdoor",
    "safe",
    "health",
    "compare",
    "current conditions",
    "now",
    "today",
)


def mentions_documents(message: str) -> bool:
    lowered = f" {message.lower().strip()} "
    return any(term in lowered for term in _DOC_TERMS)


def is_summary_request(message: str) -> bool:
    lowered = f" {message.lower().strip()} "
    return any(term in lowered for term in _SUMMARY_TERMS)


# --------------------------------------------------------------------------------------
# Historical period detection
# --------------------------------------------------------------------------------------

_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_DAYS_RE = re.compile(r"\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b")

# Phrases that anchor a question to a past period.
_HISTORY_TERMS = (
    "last year",
    "previous year",
    "past year",
    "years ago",
    "last 12 months",
    "past 12 months",
    "this year",
    "year to date",
    "ytd",
    "last month",
    "previous month",
    "past month",
    "last week",
    "past week",
    "this week",
    "last 7 days",
    "past 7 days",
    "yesterday",
    "historical",
    "history",
    "annual average",
    "yearly",
)

_MONTH_NUMBERS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
# "may" is excluded from bare matching because it is overwhelmingly the modal verb
# ("it may rain") rather than the month.
_MAY_RE = re.compile(r"\b(?:in|of|during|since|last|next|this)\s+may\b|\bmay\s+(?:19|20)\d{2}\b")


def _mentions_month(text: str) -> int | None:
    for name, number in _MONTH_NUMBERS.items():
        if re.search(rf"\b{name}\b", text):
            return number
    if _MAY_RE.search(text):
        return 5
    return None


def wants_historical(message: str) -> bool:
    """Whether the question is anchored to a past period worth fetching history for."""
    text = f" {message.lower().strip()} "
    if _YEAR_RE.search(text):
        return True
    if any(term in text for term in _HISTORY_TERMS):
        return True
    if _mentions_month(text):
        return True
    if re.search(r"\b(?:last|this|past|previous)\s+(?:winter|summer|monsoon)\b", text):
        return True
    return bool(_DAYS_RE.search(text))


def history_window(message: str, today: date | None = None) -> tuple[str, str, str] | None:
    """Resolve a past period to (start_date, end_date, human_label).

    Returns None when the message names no recognisable period, so callers can
    skip the provider call rather than guessing at a range.
    """
    today = today or datetime.now(UTC).date()
    text = f" {message.lower().strip()} "

    years = _YEAR_RE.findall(text)
    month = _mentions_month(text)
    # "November 2023" is a month, not the whole year, so a named month wins.
    if month and years:
        return _month_year_window(month, int(years[-1]), today)
    if years:
        return _year_window(int(years[-1]), today)
    if month:
        return _month_window(month, today)

    if any(
        phrase in text
        for phrase in ("last year", "previous year", "past year", "last 12 months", "past 12 months")
    ):
        return _year_window(today.year - 1, today)
    if any(phrase in text for phrase in ("this year", "year to date", "ytd")):
        return (date(today.year, 1, 1).isoformat(), today.isoformat(), f"{today.year} so far")

    if any(phrase in text for phrase in ("last month", "previous month", "past month")):
        last_prev = date(today.year, today.month, 1) - timedelta(days=1)
        start = date(last_prev.year, last_prev.month, 1)
        return (start.isoformat(), last_prev.isoformat(), start.strftime("%B %Y"))

    if any(
        phrase in text for phrase in ("last week", "past week", "this week", "last 7 days", "past 7 days")
    ):
        return ((today - timedelta(days=6)).isoformat(), today.isoformat(), "the last 7 days")

    if "yesterday" in text:
        day = today - timedelta(days=1)
        return (day.isoformat(), day.isoformat(), "yesterday")

    recent = _recent_days(text)
    if recent:
        return (
            (today - timedelta(days=recent - 1)).isoformat(),
            today.isoformat(),
            f"the last {recent} days",
        )

    return _season_window(text, today)


def _year_window(year: int, today: date) -> tuple[str, str, str]:
    if year >= today.year:
        return (date(today.year, 1, 1).isoformat(), today.isoformat(), f"{today.year} so far")
    return (date(year, 1, 1).isoformat(), date(year, 12, 31).isoformat(), str(year))


def _month_year_window(month: int, year: int, today: date) -> tuple[str, str, str]:
    start = date(year, month, 1)
    if start > today:
        # A future month names no observable data; use the most recent past one.
        return _month_window(month, today)
    end = _last_day(year, month)
    if end > today:
        end = today
    return (start.isoformat(), end.isoformat(), start.strftime("%B %Y"))


def _month_window(month: int, today: date) -> tuple[str, str, str]:
    year = today.year if month <= today.month else today.year - 1
    start = date(year, month, 1)
    end = _last_day(year, month)
    if end > today:
        end = today
    return (start.isoformat(), end.isoformat(), start.strftime("%B %Y"))


def _last_day(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1) - timedelta(days=1)


def _recent_days(text: str) -> int | None:
    match = _DAYS_RE.search(text)
    if not match:
        return None
    return max(1, min(int(match.group(1)), 365))


def _season_window(text: str, today: date) -> tuple[str, str, str] | None:
    if re.search(r"\b(?:last|this|past|previous)\s+winter\b", text):
        if today.month <= 2:
            start = date(today.year - 1, 11, 1)
            end = _last_day(today.year, 2)
        else:
            start = date(today.year, 11, 1)
            end = _last_day(today.year + 1, 2)
            if start > today:
                start = date(today.year - 1, 11, 1)
                end = _last_day(today.year, 2)
        if end > today:
            end = today
        return (start.isoformat(), end.isoformat(), "winter")

    for name, (sm, sd, em, ed) in (("summer", (3, 1, 5, 31)), ("monsoon", (6, 1, 9, 30))):
        if re.search(rf"\b(?:last|this|past|previous)\s+{name}\b", text):
            year = today.year
            start, end = date(year, sm, sd), date(year, em, ed)
            if start > today:
                year -= 1
                start, end = date(year, sm, sd), date(year, em, ed)
            if end > today:
                end = today
            return (start.isoformat(), end.isoformat(), name)
    return None
