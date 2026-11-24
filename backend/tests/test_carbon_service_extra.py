"""Additional carbon estimation branches without any geocoding traffic."""

from __future__ import annotations

import math

import pytest

from http_client import ProviderError
from services import carbon_service


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ([], (None, None)),
        ({"lat": "1.0", "lon": "2.0"}, (None, None)),
        ([{"lat": "1.0"}], (None, None)),
        ([{"lat": "not-a-number", "lon": "2.0"}], (None, None)),
        ([{"lat": None, "lon": 2.0}], (None, None)),
        ([{"lat": "12.5", "lon": "77.2"}], (12.5, 77.2)),
    ],
)
async def test_geocode_handles_unexpected_payloads(
    monkeypatch: pytest.MonkeyPatch, payload: object, expected: tuple[float | None, float | None]
) -> None:
    async def fake_request(method: str, url: str, **kwargs: object) -> object:
        assert method == "GET"
        assert url.endswith("/search")
        return payload

    monkeypatch.setattr(carbon_service, "request_json", fake_request)
    assert await carbon_service._geocode("Hyderabad") == expected


async def test_geocode_treats_provider_errors_as_unresolved(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_request(method: str, url: str, **kwargs: object) -> object:
        raise ProviderError("nominatim", "unreachable")

    monkeypatch.setattr(carbon_service, "request_json", failing_request)
    assert await carbon_service._geocode("Nowhere") == (None, None)


async def test_estimate_distance_requires_both_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    async def geocode(place: str) -> tuple[float | None, float | None]:
        return (10.0, 20.0) if place == "origin" else (None, None)

    monkeypatch.setattr(carbon_service, "_geocode", geocode)
    assert await carbon_service.estimate_distance("origin", "destination") is None


async def test_estimate_distance_rounds_the_great_circle_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def geocode(place: str) -> tuple[float | None, float | None]:
        return (0.0, 0.0) if place == "origin" else (0.0, 1.0)

    monkeypatch.setattr(carbon_service, "_geocode", geocode)
    distance = await carbon_service.estimate_distance("origin", "destination")
    assert distance == pytest.approx(round(math.radians(1.0) * carbon_service.EARTH_RADIUS_KM, 2))


async def test_missing_and_non_positive_distances_are_auto_estimated(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[object] = []

    async def estimate(origin: str, destination: str) -> float:
        seen.append((origin, destination))
        return 12.5

    monkeypatch.setattr(carbon_service, "estimate_distance", estimate)
    for supplied in (None, 0, -4.0):
        result = await carbon_service.calculate_carbon("Home", "Work", supplied, "Train")
        assert result["estimated"] is True
        assert result["distanceKm"] == 12.5
        assert result["co2eKg"] == round(12.5 * carbon_service.CO2_FACTORS_KG_PER_KM["Train"], 2)
        assert result["savings"] > 0
    assert len(seen) == 3


async def test_zero_factor_modes_keep_the_baseline_as_savings() -> None:
    result = await carbon_service.calculate_carbon("Home", "Work", 10.0, "Bicycle")
    assert result["co2eKg"] == 0.0
    assert result["savings"] == round(10.0 * carbon_service.CO2_FACTORS_KG_PER_KM["Car"], 2)
    assert result["estimated"] is False


async def test_unknown_mode_falls_back_to_the_car_factor() -> None:
    result = await carbon_service.calculate_carbon("Home", "Work", 10.0, "Rocket")
    assert result["mode"] == carbon_service.BASELINE_MODE
    assert result["co2eKg"] == round(10.0 * carbon_service.CO2_FACTORS_KG_PER_KM["Car"], 2)
    assert result["savings"] == 0.0


def test_antipodal_distance_is_half_the_earth_circumference() -> None:
    assert carbon_service.haversine_km(0.0, 0.0, 0.0, 180.0) == pytest.approx(
        math.pi * carbon_service.EARTH_RADIUS_KM
    )
