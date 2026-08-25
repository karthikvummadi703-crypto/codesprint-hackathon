import math

import httpx

CO2_FACTORS_KG_PER_KM = {
    "Car": 0.192,
    "Bike": 0.103,
    "Bus": 0.089,
    "Train": 0.041,
    "EV": 0.053,
    "Walking": 0.0,
    "Bicycle": 0.0,
}

NOMINATIM_URL = "https://nominatim.openstreetmap.org"


def _haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _geocode(place: str):
    try:
        r = httpx.get(
            f"{NOMINATIM_URL}/search",
            params={"q": place, "format": "json", "limit": 1},
            headers={"User-Agent": "AirGuard-AI-Hackathon/1.0"},
            timeout=6,
        )
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None, None


def calculate_carbon(origin: str, destination: str, distance_km: float | None, mode: str):
    factor = CO2_FACTORS_KG_PER_KM.get(mode)
    if factor is None:
        factor = CO2_FACTORS_KG_PER_KM["Car"]
        mode = "Car"

    estimated = False
    if distance_km is None or distance_km <= 0:
        lat1, lon1 = _geocode(origin)
        lat2, lon2 = _geocode(destination)
        if lat1 is not None and lat2 is not None:
            distance_km = round(_haversine(lat1, lon1, lat2, lon2), 2)
            estimated = True
        else:
            raise ValueError(
                "Distance required — could not auto-estimate from the given locations."
            )

    co2e = round(distance_km * factor * 100) / 100
    car_co2 = round(distance_km * CO2_FACTORS_KG_PER_KM["Car"] * 100) / 100
    savings = max(0, round((car_co2 - co2e) * 100) / 100)

    return {
        "origin": origin,
        "destination": destination,
        "distanceKm": distance_km,
        "mode": mode,
        "co2eKg": co2e,
        "savings": savings,
        "estimated": estimated,
    }
