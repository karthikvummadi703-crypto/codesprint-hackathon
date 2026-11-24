from __future__ import annotations

import asyncio
import math
from unittest.mock import patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from services import carbon_service

KNOWN_MODES = tuple(carbon_service.CO2_FACTORS_KG_PER_KM)
MODE_STRATEGY = st.one_of(st.sampled_from(KNOWN_MODES), st.text(alphabet="xyz ", min_size=1, max_size=8))
COORDINATE = st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False)


@settings(deadline=None, max_examples=30, derandomize=True, database=None)
@given(latitude=COORDINATE, longitude=COORDINATE)
def test_haversine_is_zero_at_identical_points(latitude: float, longitude: float) -> None:
    assert carbon_service.haversine_km(latitude, longitude, latitude, longitude) == pytest.approx(
        0.0, abs=1e-9
    )


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    lat1=st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False),
    lon1=COORDINATE,
    lat2=st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False),
    lon2=COORDINATE,
)
def test_haversine_is_symmetric_and_bounded(lat1: float, lon1: float, lat2: float, lon2: float) -> None:
    forward = carbon_service.haversine_km(lat1, lon1, lat2, lon2)
    reverse = carbon_service.haversine_km(lat2, lon2, lat1, lon1)
    assert forward == pytest.approx(reverse, abs=1e-9)
    assert 0.0 <= forward <= math.pi * carbon_service.EARTH_RADIUS_KM + 1e-6


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(delta_lon=st.floats(min_value=0.0, max_value=180.0, allow_nan=False, allow_infinity=False))
def test_haversine_along_equator_matches_arc_length(delta_lon: float) -> None:
    expected = math.radians(delta_lon) * carbon_service.EARTH_RADIUS_KM
    assert carbon_service.haversine_km(0.0, 0.0, 0.0, delta_lon) == pytest.approx(expected, abs=1e-6)


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(
    distance=st.floats(
        min_value=0.01,
        max_value=carbon_service.MAX_DISTANCE_KM,
        allow_nan=False,
        allow_infinity=False,
    ),
    mode=MODE_STRATEGY,
)
def test_calculate_carbon_uses_factor_and_car_savings(distance: float, mode: str) -> None:
    result = asyncio.run(carbon_service.calculate_carbon("Origin", "Destination", distance, mode))
    effective_mode = mode if mode in carbon_service.CO2_FACTORS_KG_PER_KM else carbon_service.BASELINE_MODE
    factor = carbon_service.CO2_FACTORS_KG_PER_KM[effective_mode]
    baseline = carbon_service.CO2_FACTORS_KG_PER_KM[carbon_service.BASELINE_MODE]
    expected_co2e = round(distance * factor, 2)
    expected_car = round(distance * baseline, 2)
    assert result["mode"] == effective_mode
    assert result["estimated"] is False
    assert result["distanceKm"] == pytest.approx(distance)
    assert result["co2eKg"] == pytest.approx(expected_co2e)
    assert result["savings"] == pytest.approx(round(max(0.0, expected_car - expected_co2e), 2))


@settings(deadline=None, max_examples=30, derandomize=True, database=None)
@given(
    distance=st.floats(
        min_value=carbon_service.MAX_DISTANCE_KM + 0.01,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    )
)
def test_calculate_carbon_clamps_excessive_distance(distance: float) -> None:
    result = asyncio.run(carbon_service.calculate_carbon("Origin", "Destination", distance, "Car"))
    assert result["distanceKm"] == carbon_service.MAX_DISTANCE_KM
    assert result["co2eKg"] == round(carbon_service.MAX_DISTANCE_KM * 0.192, 2)
    assert result["savings"] == 0.0


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(distance=st.floats(min_value=-100.0, max_value=0.0, allow_nan=False, allow_infinity=False))
def test_calculate_carbon_requires_distance_when_geocoding_fails(distance: float) -> None:
    async def unresolved(origin: str, destination: str) -> None:
        return None

    with (
        patch.object(carbon_service, "estimate_distance", unresolved),
        pytest.raises(ValueError, match="Distance required"),
    ):
        asyncio.run(carbon_service.calculate_carbon("Origin", "Destination", distance, "Car"))
