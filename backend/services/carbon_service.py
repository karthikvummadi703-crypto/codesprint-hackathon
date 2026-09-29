"""Travel carbon estimation.

Emission factors are UK DEFRA 2023 average-passenger-vehicle figures in kg CO2e
per passenger-km. Distances come from the caller's input when supplied, otherwise
from a great-circle calculation over geocoded endpoints.
"""

from __future__ import annotations

import math

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger
from services import geocoding_service

log = get_logger("airguard.carbon")

CO2_FACTORS_KG_PER_KM = {
    "Car": 0.192,
    "Bike": 0.103,
    "Bus": 0.089,
    "Train": 0.041,
    "EV": 0.053,
    "Walking": 0.0,
    "Bicycle": 0.0,
}

BASELINE_MODE = "Car"
EARTH_RADIUS_KM = 6371.0
MAX_DISTANCE_KM = 20_000.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(delta_lon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


async def _geocode(place: str) -> tuple[float | None, float | None]:
    settings = get_settings()
    try:
        data = await request_json(
            "GET",
            f"{settings.nominatim_base_url}/search",
            provider="nominatim",
            params={"q": place, "format": "json", "limit": 1},
        )
    except ProviderError as exc:
        log.warning("geocode failed for %r: %s", place, exc)
        return None, None
    if isinstance(data, list) and data:
        try:
            return float(data[0]["lat"]), float(data[0]["lon"])
        except (KeyError, TypeError, ValueError):
            return None, None
    return None, None


async def estimate_distance(origin: str, destination: str) -> float | None:
    """Great-circle distance between two named places, or None if unresolvable."""
    lat1, lon1 = await _geocode(origin)
    lat2, lon2 = await _geocode(destination)
    if lat1 is None or lat2 is None:
        return None
    return round(haversine_km(lat1, lon1, lat2, lon2), 2)


async def calculate_carbon(
    origin: str, destination: str, distance_km: float | None, mode: str
) -> dict:
    """CO2e for a trip, plus savings against the same trip by car."""
    factor = CO2_FACTORS_KG_PER_KM.get(mode)
    if factor is None:
        log.info("unknown travel mode %r; falling back to %s", mode, BASELINE_MODE)
        factor = CO2_FACTORS_KG_PER_KM[BASELINE_MODE]
        mode = BASELINE_MODE

    estimated = False
    if distance_km is None or distance_km <= 0:
        computed = await estimate_distance(origin, destination)
        if computed is None:
            raise ValueError(
                "Distance required — could not auto-estimate it from the given locations. "
                "Enter the distance manually."
            )
        distance_km = computed
        estimated = True

    distance_km = min(float(distance_km), MAX_DISTANCE_KM)
    co2e = round(distance_km * factor, 2)
    car_co2 = round(distance_km * CO2_FACTORS_KG_PER_KM[BASELINE_MODE], 2)

    return {
        "origin": origin,
        "destination": destination,
        "distanceKm": distance_km,
        "mode": mode,
        "co2eKg": co2e,
        "savings": round(max(0.0, car_co2 - co2e), 2),
        "estimated": estimated,
    }
