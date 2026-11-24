"""Additional formatter fallbacks exercised through the context builder."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from services import ai_context
from services.air_quality_service import aqi_category
from services.context import formatters


def make_builder(
    aqi_forecast: list[dict[str, object]] | None = None,
    predictions: list[dict[str, object]] | None = None,
    carbon_trips: list[dict[str, object]] | None = None,
    rag_chunks: list[dict[str, object]] | None = None,
) -> ai_context.ContextBuilder:
    return ai_context.ContextBuilder(
        location={},
        air_quality=None,
        aqi_forecast=aqi_forecast,
        weather=None,
        predictions=predictions,
        carbon_trips=carbon_trips,
        history=[],
        rag_chunks=rag_chunks,
    )


def test_naive_timestamps_are_treated_as_utc() -> None:
    naive = (datetime.now(UTC) + timedelta(hours=2)).replace(tzinfo=None, microsecond=0)
    assert formatters._relative_label(naive.isoformat()) == "in 2h"


def test_context_timestamp_ends_with_the_utc_marker() -> None:
    assert formatters.context_timestamp().endswith("Z")


def test_provider_forecast_rows_use_relative_labels_and_provider_values() -> None:
    timestamp = (datetime.now(UTC) + timedelta(hours=3)).isoformat().replace("+00:00", "Z")
    builder = make_builder(
        aqi_forecast=[
            {"aqi": 88, "dominant": "pm25"},
            {"aqi": 120, "timestamp": timestamp},
        ]
    )
    rows = builder._normalized_forecast()
    assert rows[0]["label"] == "later"
    assert rows[0]["aqi"] == 88
    assert rows[0]["status"] == aqi_category(88)
    assert rows[0]["dominantPollutant"] == "pm25"
    assert rows[0]["timeOffsetHours"] == 24
    assert rows[1]["label"] == "in 3h"


def test_explicit_forecast_labels_win_over_timestamps() -> None:
    builder = make_builder(
        aqi_forecast=[
            {
                "aqi": 0,
                "label": "Morning",
                "dominantPollutant": "ozone",
                "timestamp": "not-a-time",
                "timeOffsetHours": 6,
            }
        ]
    )
    assert builder._normalized_forecast() == [
        {
            "label": "Morning",
            "aqi": 0,
            "status": aqi_category(0),
            "dominantPollutant": "ozone",
            "timeOffsetHours": 6,
        }
    ]


def test_stored_predictions_are_used_when_the_provider_forecast_is_missing() -> None:
    builder = make_builder(
        predictions=[
            {"aqi": None, "label": "skip"},
            {"aqi": "120", "status": "Custom label", "dominantPollutant": "no2", "timeOffsetHours": 12},
            {"aqi": 60},
        ]
    )
    rows = builder._normalized_forecast()
    assert len(rows) == 2
    assert rows[0]["status"] == "Custom label"
    assert rows[0]["dominantPollutant"] == "no2"
    assert rows[1]["status"] == aqi_category(60)
    assert rows[1]["dominantPollutant"] == "n/a"
    assert rows[1]["timeOffsetHours"] == 24
    assert make_builder()._normalized_forecast() == []


def test_carbon_section_without_trips_states_the_absence() -> None:
    assert make_builder()._carbon_section() == "CARBON RECORD: no travel trips logged yet."


def test_carbon_section_ignores_unusable_co2_values_and_sorts_by_impact() -> None:
    builder = make_builder(
        carbon_trips=[
            {"co2eKg": "bad"},
            {"mode": "Walk"},
            {"mode": "Bus", "co2eKg": 3.2},
            {"mode": "Car", "co2eKg": 10.0},
        ]
    )
    section = builder._carbon_section()
    assert section.splitlines()[0].endswith("4 trips, 13.2 kg CO2e total.")
    assert section.splitlines()[1] == "By mode: Car 10.0 kg, Bus 3.2 kg"


def test_document_section_supplies_default_source_and_omits_zero_relevance() -> None:
    section = make_builder(rag_chunks=[{"chunk": "quoted text", "score": 0.0}])._documents_section()
    assert section == (
        "RETRIEVED USER DOCUMENTS (quote from these; do not invent content):\n"
        "[excerpt 1 from uploaded document]\nquoted text"
    )


def test_document_section_includes_at_most_four_excerpts() -> None:
    chunks = [{"fileName": "report.txt", "chunk": f"excerpt {index}", "score": 0.5} for index in range(5)]
    section = make_builder(rag_chunks=chunks)._documents_section()
    assert section.count("[excerpt ") == 4
    assert "relevance 0.5" in section
    assert "excerpt 5" not in section
