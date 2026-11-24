from __future__ import annotations

from collections.abc import Sequence

from hypothesis import given, settings
from hypothesis import strategies as st

from services.aqi.breakpoints import (
    CO_BREAKS,
    NO2_BREAKS,
    O3_BREAKS,
    PM10_BREAKS,
    PM25_BREAKS,
    SO2_BREAKS,
)
from services.aqi.math import _sub_index, aqi_category, compute_aqi, health_advisory

BREAK_TABLES: tuple[Sequence[tuple[float, int]], ...] = (
    PM25_BREAKS,
    PM10_BREAKS,
    NO2_BREAKS,
    SO2_BREAKS,
    CO_BREAKS,
    O3_BREAKS,
)
CATEGORY_BOUNDS: tuple[tuple[int, str], ...] = (
    (50, "Good"),
    (100, "Moderate"),
    (150, "Unhealthy for Sensitive Groups"),
    (200, "Unhealthy"),
    (300, "Very Unhealthy"),
    (10_000, "Hazardous"),
)


def _expected_category(aqi: int) -> str:
    for upper, name in CATEGORY_BOUNDS:
        if aqi <= upper:
            return name
    return CATEGORY_BOUNDS[-1][1]


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(table=st.sampled_from(BREAK_TABLES))
def test_breakpoint_tables_are_ordered(table: Sequence[tuple[float, int]]) -> None:
    concentrations = [row[0] for row in table]
    indices = [row[1] for row in table]
    assert concentrations == sorted(set(concentrations))
    assert indices == [50, 100, 150, 200, 300, 400, 500]


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    table=st.sampled_from(BREAK_TABLES),
    first=st.floats(min_value=0.0, max_value=1_000.0, allow_nan=False, allow_infinity=False),
    second=st.floats(min_value=0.0, max_value=1_000.0, allow_nan=False, allow_infinity=False),
)
def test_sub_index_is_monotonic(table: Sequence[tuple[float, int]], first: float, second: float) -> None:
    lower, upper = sorted((first, second))
    assert _sub_index(lower, table) <= _sub_index(upper, table)


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(
    table=st.sampled_from(BREAK_TABLES),
    row_index=st.integers(min_value=0, max_value=6),
)
def test_breakpoint_concentration_maps_to_its_index_high(
    table: Sequence[tuple[float, int]], row_index: int
) -> None:
    concentration, index_high = table[row_index]
    assert _sub_index(concentration, table) == index_high


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(aqi=st.integers(min_value=-50, max_value=1_000))
def test_aqi_category_matches_boundary_table(aqi: int) -> None:
    assert aqi_category(aqi) == _expected_category(aqi)


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(boundary_index=st.integers(min_value=0, max_value=len(CATEGORY_BOUNDS) - 2))
def test_aqi_category_transitions_immediately_after_each_boundary(boundary_index: int) -> None:
    upper, name = CATEGORY_BOUNDS[boundary_index]
    following = CATEGORY_BOUNDS[boundary_index + 1][1]
    assert aqi_category(upper) == name
    assert aqi_category(upper + 1) == following


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    pm25=st.floats(min_value=0.0, max_value=500.0, allow_nan=False, allow_infinity=False),
    pm10=st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False),
    co=st.floats(min_value=0.0, max_value=60_000.0, allow_nan=False, allow_infinity=False),
)
def test_compute_aqi_reports_max_sub_index_and_its_pollutant(pm25: float, pm10: float, co: float) -> None:
    result = compute_aqi({"pm2_5": pm25, "pm10": pm10, "co": co})
    assert result["aqi"] == max(result["sub"].values())
    assert result["sub"][result["dominant"]] == result["aqi"]


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    aqi=st.integers(min_value=0, max_value=1_000),
    label=st.text(alphabet="abc ", min_size=1, max_size=12),
)
def test_health_advisory_names_the_dominant_pollutant(aqi: int, label: str) -> None:
    assert label in health_advisory(aqi, label)
