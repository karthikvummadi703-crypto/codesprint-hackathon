"""Additional query-routing branches not covered by the shared routing tests."""

from __future__ import annotations

from datetime import date

import pytest

from services import query_router as qr


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("good morning everyone", "greeting"),
        ("who are you?", "greeting"),
        ("thanks a lot", "greeting"),
        ("grab an umbrella", "rain"),
        ("the monsoon is here", "rain"),
        ("will it snow tonight?", "rain"),
        ("uv index today", "weather"),
        ("a chilly degree outside", "weather"),
        ("my asthma is acting up", "safety"),
        ("should kids wear a mask?", "safety"),
        ("flight emissions for my trip", "carbon"),
        ("upload the csv", "documents"),
        ("trend over time", "comparison"),
        ("why is the sky hazy?", "cause"),
        ("expected later today", "forecast"),
        ("ozone levels now", "air_quality"),
    ],
)
def test_each_rule_family_classifies(message: str, expected: str) -> None:
    assert qr.classify(message) == expected


@pytest.mark.parametrize(
    "message",
    [
        "weather and aqi together",
        "humidity and pollution together",
        "temperature and pollution",
        "wind plus pollution",
        "rainfall with air quality",
    ],
)
def test_combined_triggers_win_over_single_rules(message: str) -> None:
    assert qr.classify(message) == "combined"
    assert qr.BLOCK_AQI_NOW in qr.blocks_for("combined")
    assert qr.BLOCK_WEATHER_NOW in qr.blocks_for("combined")


@pytest.mark.parametrize(
    "message",
    [
        "the attached file mentions weather",
        "my file about current conditions",
        "this file discusses temperature",
    ],
)
def test_document_plus_environment_requests_both_contexts(message: str) -> None:
    assert qr.classify(message) == "document_context"
    assert qr.blocks_for("document_context") == (
        qr.BLOCK_LOCATION,
        qr.BLOCK_DOCUMENTS,
        qr.BLOCK_AQI_NOW,
        qr.BLOCK_WEATHER_NOW,
        qr.BLOCK_WEATHER_FORECAST,
        qr.BLOCK_VULNERABILITY,
    )


def test_document_helpers_ignore_ordinary_questions() -> None:
    assert qr.mentions_documents("the attachment")
    assert qr.mentions_documents("our knowledge base")
    assert not qr.mentions_documents("the weather outside")
    assert qr.is_summary_request("key takeaways")
    assert qr.is_summary_request("what does it say")
    assert not qr.is_summary_request("what is the aqi?")


def test_block_helpers_distinguish_document_only_questions() -> None:
    assert qr.blocks_for("combined") == (
        qr.BLOCK_LOCATION,
        qr.BLOCK_AQI_NOW,
        qr.BLOCK_WEATHER_NOW,
        qr.BLOCK_WEATHER_FORECAST,
        qr.BLOCK_VULNERABILITY,
    )
    assert qr.wants_documents("document_context")
    assert not qr.wants_documents("combined")
    assert qr.wants_location("combined")
    assert not qr.wants_location("documents")


@pytest.mark.parametrize(
    "message",
    [
        "this year",
        "year to date",
        "ytd",
        "past 12 months",
        "last month",
        "this week",
        "annual average",
        "last summer",
        "previous winter",
        "past 3 days",
        "yesterday",
        "may 2023",
        "in may",
    ],
)
def test_additional_historical_anchors(message: str) -> None:
    assert qr.wants_historical(message)


@pytest.mark.parametrize("message", ["it may rain", "what is the aqi today?", "tomorrow's forecast"])
def test_present_and_future_questions_are_not_historical(message: str) -> None:
    assert not qr.wants_historical(message)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("show me ytd", ("2026-01-01", "2026-06-01", "2026 so far")),
        ("how was last month", ("2026-05-01", "2026-05-31", "May 2026")),
        ("how was last week", ("2026-05-26", "2026-06-01", "the last 7 days")),
        ("how was yesterday", ("2026-05-31", "2026-05-31", "yesterday")),
        ("past 3 days", ("2026-05-30", "2026-06-01", "the last 3 days")),
        ("last 999 days", ("2025-06-02", "2026-06-01", "the last 365 days")),
        ("last 0 days", ("2026-06-01", "2026-06-01", "the last 1 days")),
        ("last summer", ("2026-03-01", "2026-05-31", "summer")),
        ("past winter", ("2025-11-01", "2026-02-28", "winter")),
        ("in December", ("2025-12-01", "2025-12-31", "December 2025")),
        ("in May 2023", ("2023-05-01", "2023-05-31", "May 2023")),
        ("November 2025", ("2025-11-01", "2025-11-30", "November 2025")),
    ],
)
def test_history_window_resolves_additional_periods(message: str, expected: tuple[str, str, str]) -> None:
    assert qr.history_window(message, today=date(2026, 6, 1)) == expected


def test_winter_window_is_clamped_to_the_current_day() -> None:
    assert qr.history_window("last winter", today=date(2026, 1, 15)) == (
        "2025-11-01",
        "2026-01-15",
        "winter",
    )


def test_future_year_is_reported_as_the_current_year_to_date() -> None:
    assert qr.history_window("air quality in 2099", today=date(2026, 6, 1)) == (
        "2026-01-01",
        "2026-06-01",
        "2026 so far",
    )


def test_temperature_plus_aqi_keeps_the_weather_intent() -> None:
    assert qr.classify("temperature versus aqi") == "weather"


def test_document_plus_ozone_keeps_the_document_only_intent() -> None:
    assert qr.classify("my data about ozone") == "documents"


def test_my_data_is_not_a_document_context_trigger() -> None:
    assert qr.classify("my data about current conditions") == "documents"
