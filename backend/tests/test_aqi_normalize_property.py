from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from services.aqi.history import _mean_components
from services.aqi.normalize import (
    _normalize_google_components,
    _normalize_google_status,
    _pick_google_index,
)

COMPONENT_KEYS = ("pm2_5", "pm10", "o3", "no2", "so2", "co")
COMPONENT_MAP = {
    "pm25": "pm2_5",
    "pm10": "pm10",
    "o3": "o3",
    "no2": "no2",
    "so2": "so2",
    "co": "co",
}
STATUS_MAP = {
    "good": "Good",
    "moderate": "Moderate",
    "unhealthy for sensitive groups": "Unhealthy for Sensitive Groups",
    "unhealthy": "Unhealthy",
    "very unhealthy": "Very Unhealthy",
    "hazardous": "Hazardous",
}
CONCENTRATION = st.floats(min_value=0.0, max_value=500.0, allow_nan=False, allow_infinity=False)


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(rows=st.lists(st.dictionaries(st.sampled_from(COMPONENT_KEYS), CONCENTRATION), max_size=8))
def test_mean_components_stays_within_observed_range(rows: list[dict[str, float]]) -> None:
    averaged = _mean_components(rows)
    if not rows:
        assert averaged == {}
    for key, value in averaged.items():
        observed = [row[key] for row in rows if key in row]
        assert observed
        assert value == pytest.approx(sum(observed) / len(observed))
        assert min(observed) <= value <= max(observed)


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(rows=st.lists(st.dictionaries(st.sampled_from(COMPONENT_KEYS), CONCENTRATION), min_size=1, max_size=8))
def test_mean_components_of_identical_rows_preserves_values(rows: list[dict[str, float]]) -> None:
    averaged = _mean_components([dict(rows[0]) for _ in rows])
    for key, value in averaged.items():
        assert value == pytest.approx(rows[0][key])


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(
    entries=st.lists(
        st.tuples(
            st.sampled_from((*COMPONENT_MAP, "unknown")),
            st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
            st.sampled_from(("ug/m3", "mg/m3", "MG/M3", "ppb")),
        ),
        max_size=10,
    )
)
def test_normalize_google_components_converts_units_and_keeps_last_value(
    entries: list[tuple[str, float, str]],
) -> None:
    payload = {
        "pollutants": [
            {"code": code, "concentration": {"value": value, "units": units}}
            for code, value, units in entries
        ]
    }
    expected: dict[str, float] = {}
    for code, value, units in entries:
        if code in COMPONENT_MAP:
            expected[COMPONENT_MAP[code]] = value * 1000.0 if "mg/m" in units.lower() else value
    assert _normalize_google_components(payload) == pytest.approx(expected)


@settings(deadline=None, max_examples=30, derandomize=True, database=None)
@given(raw=st.sampled_from((*STATUS_MAP, "FINE", "", "unknown")))
def test_normalize_google_status_is_case_insensitive(raw: str) -> None:
    assert _normalize_google_status(raw) == STATUS_MAP.get(raw.lower(), "")


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    codes=st.lists(
        st.sampled_from(("usa_epa", "USA_EPA", "other", "")),
        max_size=8,
    )
)
def test_pick_google_index_prefers_first_usa_epa_entry(codes: list[str]) -> None:
    indexes = [{"code": code, "rank": rank} for rank, code in enumerate(codes)]
    preferred = next((rank for rank, code in enumerate(codes) if code.lower() == "usa_epa"), None)
    expected = indexes[preferred] if preferred is not None else (indexes[0] if indexes else None)
    assert _pick_google_index(indexes) == expected
