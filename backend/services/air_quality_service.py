import math
import os
import random
from datetime import datetime, timezone

import httpx

OPENWEATHER_KEY = os.getenv("OPENWEATHER_APPID") or os.getenv("AIR_QUALITY_API_KEY")
GOOGLE_AQ_API_KEY = os.getenv("GOOGLE_AQ_API_KEY") or os.getenv("GOOGLE_AIR_QUALITY_API_KEY")
NOMINATIM_URL = "https://nominatim.openstreetmap.org"
GOOGLE_AQ_URL = "https://airquality.googleapis.com/v1/currentConditions:lookup"

AQI_BREAKPOINTS = [
    (0, 50), (51, 100), (101, 150), (151, 200), (201, 300), (301, 400), (401, 500),
]

CATEGORIES = [
    "Good",
    "Moderate",
    "Unhealthy for Sensitive Groups",
    "Unhealthy",
    "Very Unhealthy",
    "Hazardous",
]


def aqi_category(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


def _sub_index(value: float, breaks: list) -> int:
    c_low, c_high = 0.0, 0.0
    i_low, i_high = 0, 50
    for i, (c, idx) in enumerate(breaks):
        c_hi = c
        i_hi = idx
        if value <= c_hi:
            c_high = c_hi
            i_high = i_hi
            if i > 0:
                c_low = breaks[i - 1][0]
                i_low = breaks[i - 1][1]
            else:
                c_low = 0
                i_low = 0
            break
        c_low = c_hi
        i_low = i_hi
    else:
        c_low = breaks[-1][0]
        i_low = breaks[-1][1]
        c_high = breaks[-1][0] * 2
        i_high = breaks[-1][1] + 50
    return round(i_low + (i_high - i_low) * (value - c_low) / (c_high - c_low))


PM25_BREAKS = [(12, 50), (35.4, 100), (55.4, 150), (150.4, 200), (250.4, 300), (350.4, 400), (500.4, 500)]
PM10_BREAKS = [(54, 50), (154, 100), (254, 150), (354, 200), (424, 300), (504, 400), (604, 500)]
NO2_BREAKS = [(53, 50), (100, 100), (360, 150), (649, 200), (1249, 300), (1649, 400), (2049, 500)]
SO2_BREAKS = [(35, 50), (75, 100), (185, 150), (304, 200), (604, 300), (804, 400), (1004, 500)]
CO_BREAKS = [(4.4, 50), (9.4, 100), (12.4, 150), (15.4, 200), (30.4, 300), (40.4, 400), (50.4, 500)]
O3_BREAKS = [(54, 50), (70, 100), (85, 150), (105, 200), (200, 300), (300, 400), (400, 500)]


def compute_aqi(components: dict) -> dict:
    pm25 = float(components.get("pm2_5", 0) or 0)
    pm10 = float(components.get("pm10", 0) or 0)
    o3 = float(components.get("o3", 0) or 0)
    no2 = float(components.get("no2", 0) or 0)
    so2 = float(components.get("so2", 0) or 0)
    co = float(components.get("co", 0) or 0) / 1000  # µg/m³ -> mg/m³ (CO breakpoints are in mg/m³)

    sub = {
        "pm25": _sub_index(pm25, PM25_BREAKS),
        "pm10": _sub_index(pm10, PM10_BREAKS),
        "o3": _sub_index(o3 / 1.96, O3_BREAKS),
        "no2": _sub_index(no2 / 1.88, NO2_BREAKS),
        "so2": _sub_index(so2 / 2.62, SO2_BREAKS),
        "co": _sub_index(co / 1.15, CO_BREAKS),
    }
    dominant = max(sub, key=sub.get)
    aqi = max(sub.values())
    return {"aqi": aqi, "dominant": dominant, "sub": sub}


def pollutants_from_components(components: dict, dominant: str) -> list:
    def status(v, limit):
        return "Good" if v <= limit else "High"

    rows = []
    if components.get("pm2_5") is not None:
        v = float(components["pm2_5"])
        rows.append({"id": "pm25", "name": "PM2.5", "value": v, "unit": "µg/m³", "status": status(v, 35),
                     "description": "Fine particulate matter — main contributor to AQI today.", "safeLimit": 35})
    if components.get("pm10") is not None:
        v = float(components["pm10"])
        rows.append({"id": "pm10", "name": "PM10", "value": v, "unit": "µg/m³", "status": status(v, 150),
                     "description": "Coarse particles from road dust and construction.", "safeLimit": 150})
    if components.get("no2") is not None:
        v = float(components["no2"])
        rows.append({"id": "no2", "name": "NO₂", "value": v, "unit": "µg/m³", "status": status(v, 100),
                     "description": "Nitrogen dioxide from vehicle and industrial emissions.", "safeLimit": 100})
    if components.get("so2") is not None:
        v = float(components["so2"])
        rows.append({"id": "so2", "name": "SO₂", "value": v, "unit": "µg/m³", "status": status(v, 80),
                     "description": "Sulfur dioxide from fossil fuel combustion.", "safeLimit": 80})
    if components.get("co") is not None:
        v = float(components["co"]) / 1000
        rows.append({"id": "co", "name": "CO", "value": round(v, 2), "unit": "mg/m³", "status": status(v, 10),
                     "description": "Carbon monoxide from incomplete combustion.", "safeLimit": 10})
    if components.get("o3") is not None:
        v = float(components["o3"])
        rows.append({"id": "o3", "name": "O₃", "value": v, "unit": "µg/m³", "status": status(v, 100),
                     "description": "Ground-level ozone formed by sunlight reactions.", "safeLimit": 100})
    if not rows:
        rows.append({"id": "pm25", "name": "PM2.5", "value": 0, "unit": "µg/m³", "status": "Good",
                     "description": "Fine particulate matter.", "safeLimit": 35})
    return rows


def health_advisory(status: str, aqi: int, dominant: str) -> str:
    if aqi <= 50:
        return "Air quality is satisfactory and poses little or no risk."
    if aqi <= 100:
        return "Air quality is acceptable; however, there may be a risk for some people who are unusually sensitive to air pollution."
    if aqi <= 150:
        return f"Sensitive groups should reduce prolonged or heavy outdoor exertion. {dominant} is elevated today."
    if aqi <= 200:
        return "Everyone may begin to experience health effects; sensitive groups may experience more serious effects."
    if aqi <= 300:
        return "Health alert: everyone may experience more serious health effects."
    return "Health warnings of emergency conditions. Avoid all outdoor activity."


def reverse_geocode(lat: float, lon: float) -> str:
    try:
        r = httpx.get(
            f"{NOMINATIM_URL}/reverse",
            params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
            headers={"User-Agent": "AirGuard-AI-Hackathon/1.0"},
            timeout=6,
        )
        data = r.json()
        addr = data.get("address", {})
        name = data.get("display_name", "").split(",")[0]
        city = addr.get("city") or addr.get("town") or addr.get("village") or name
        region = addr.get("state") or addr.get("county") or ""
        country = addr.get("country", "")
        return city, region, country
    except Exception:
        return "My Location", "", ""


def geocode(city: str) -> tuple:
    try:
        r = httpx.get(
            f"{NOMINATIM_URL}/search",
            params={"q": city, "format": "json", "limit": 1},
            headers={"User-Agent": "AirGuard-AI-Hackathon/1.0"},
            timeout=6,
        )
        data = r.json()
        if data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            display = data[0].get("display_name", city)
            return lat, lon, display.split(",")[0], data[0].get("address", {}).get("country", "")
    except Exception:
        pass
    return None, None, city, ""


def search_places(query: str, limit: int = 5) -> list:
    """Return place suggestions for the location search box."""
    try:
        r = httpx.get(
            f"{NOMINATIM_URL}/search",
            params={"q": query, "format": "json", "limit": limit, "addressdetails": 1},
            headers={"User-Agent": "AirGuard-AI-Hackathon/1.0"},
            timeout=6,
        )
        data = r.json()
    except Exception:
        return []
    results = []
    for item in data:
        addr = item.get("address", {})
        city = (
            addr.get("city")
            or addr.get("town")
            or addr.get("village")
            or addr.get("county")
            or item.get("display_name", "").split(",")[0]
        )
        region = addr.get("state") or addr.get("county") or ""
        country = addr.get("country", "")
        results.append({
            "name": city,
            "latitude": float(item.get("lat", 0)),
            "longitude": float(item.get("lon", 0)),
            "region": region,
            "country": country,
            "label": item.get("display_name", city),
        })
    return results


def reverse_geocode_full(lat: float, lon: float) -> dict:
    city, region, country = reverse_geocode(lat, lon)
    return {"name": city, "latitude": lat, "longitude": lon, "region": region, "country": country}


def fetch_from_openweather(lat: float, lon: float) -> dict | None:
    if not OPENWEATHER_KEY:
        return None
    try:
        r = httpx.get(
            "https://api.openweathermap.org/data/2.5/air_pollution",
            params={"lat": lat, "lon": lon, "appid": OPENWEATHER_KEY},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if not data.get("list"):
            return None
        return data["list"][0].get("components", {})
    except Exception:
        return None


def fetch_from_google(lat: float, lon: float) -> dict | None:
    """Fetch live air quality from the Google Air Quality API.

    Returns a normalized dict {"components", "aqi", "status", "dominant", "healthRecommendations"}
    or None when the key is missing or the request fails.
    """
    if not GOOGLE_AQ_API_KEY:
        return None
    try:
        r = httpx.post(
            GOOGLE_AQ_URL,
            params={"key": GOOGLE_AQ_API_KEY},
            json={
                "location": {"latitude": lat, "longitude": lon},
                "extraComputations": [
                    "HEALTH_RECOMMENDATIONS",
                    "LOCAL_AQI",
                    "POLLUTANT_ADDITIONAL_INFO",
                ],
            },
            timeout=8,
        )
        if r.status_code != 200:
            return None
        data = r.json()

        components = {}
        for p in data.get("pollutants", []):
            conc = p.get("concentration") or {}
            raw = conc.get("value")
            if raw is None:
                continue
            value = float(raw)
            units = str(conc.get("units", ""))
            if "mg/m" in units.lower():
                value = value * 1000  # normalize to µg/m³ to match OWM convention
            key = str(p.get("code", "")).lower()
            code_map = {"pm25": "pm2_5", "pm10": "pm10", "o3": "o3", "no2": "no2", "so2": "so2", "co": "co"}
            if key in code_map:
                components[code_map[key]] = value

        if not components:
            return None

        idx = _pick_google_index(data.get("indexes", []))
        return {
            "components": components,
            "aqi": int(idx["aqi"]) if idx and idx.get("aqi") is not None else None,
            "status": idx.get("category", "") if idx else "",
            "dominant": (idx.get("dominantPollutant", "") or "").lower() if idx else "",
            "healthRecommendations": data.get("healthRecommendations", ""),
        }
    except Exception:
        return None


def _pick_google_index(indexes: list) -> dict | None:
    if not indexes:
        return None
    for idx in indexes:
        if str(idx.get("code", "")).lower() == "usa_epa":
            return idx
    return indexes[0]


def _normalize_google_status(category: str) -> str:
    c = str(category).lower()
    mapping = {
        "good": "Good",
        "moderate": "Moderate",
        "unhealthy for sensitive groups": "Unhealthy for Sensitive Groups",
        "unhealthy": "Unhealthy",
        "very unhealthy": "Very Unhealthy",
        "hazardous": "Hazardous",
    }
    return mapping.get(c, "")


DOMINANT_LABELS = {
    "pm25": "PM2.5",
    "pm10": "PM10",
    "o3": "O₃",
    "no2": "NO₂",
    "so2": "SO₂",
    "co": "CO",
}


def _dominant_label(key: str) -> str:
    return DOMINANT_LABELS.get(key, str(key).upper())


def build_mock_components(lat: float, lon: float) -> dict:
    seed = int(abs(lat * 1000 + lon * 1000)) or 42
    rnd = random.Random(seed)
    base = 30 + rnd.randint(0, 70)
    return {
        "pm2_5": base,
        "pm10": base * 1.6,
        "no2": 12 + rnd.randint(0, 25),
        "so2": 5 + rnd.randint(0, 12),
        "co": rnd.randint(400, 1200),
        "o3": 20 + rnd.randint(0, 40),
    }


def build_historical(aqi: int, components: dict) -> list:
    rnd = random.Random(aqi)
    points = []
    for i in range(12):
        hour = (i * 2) % 24
        factor = 0.82 + 0.18 * math.sin(i / 12 * math.pi)
        points.append({
            "time": f"{hour:02d}:00",
            "aqi": max(20, round(aqi * factor)),
            "pm25": round(components.get("pm2_5", 50) * factor, 1),
            "pm10": round(components.get("pm10", 80) * factor, 1),
            "no2": round(components.get("no2", 25) * factor, 1),
            "so2": round(components.get("so2", 10) * factor, 1),
            "co": round(components.get("co", 800) / 1000 * factor, 2),
            "o3": round(components.get("o3", 35) * factor, 1),
        })
    return points


def get_air_quality(lat: float | None = None, lon: float | None = None, city: str | None = None) -> dict:
    name = city or "Gudur, Andhra Pradesh"
    region = ""
    country = ""
    source = "mock"

    if city:
        places = search_places(city, limit=1)
        if places:
            p = places[0]
            lat, lon = p["latitude"], p["longitude"]
            name = p["name"]
            region = p.get("region", "")
            country = p.get("country", "")
        else:
            glat, glon, gname, gcountry = geocode(city)
            if glat is not None:
                lat, lon = glat, glon
                name = gname
                country = gcountry
    elif lat is not None and lon is not None:
        cname, region, country = reverse_geocode(lat, lon)
        name = f"{cname}" if cname else f"{lat:.2f}, {lon:.2f}"

    if lat is None or lon is None:
        lat, lon = 14.1489, 79.8530
        if not city:
            name = "Gudur, Andhra Pradesh"

    google = fetch_from_google(lat, lon)
    if google:
        source = "google"
        components = google["components"]
        calc = compute_aqi(components)
        if google.get("aqi") is not None:
            aqi = max(1, google["aqi"])
            status = _normalize_google_status(google.get("status", ""))
            if not status:
                status = aqi_category(aqi)
        else:
            aqi = max(30, calc["aqi"])
            status = aqi_category(aqi)
        dominant_key = google.get("dominant") or calc["dominant"]
        if dominant_key not in DOMINANT_LABELS:
            dominant_key = calc["dominant"]
        advisory = google.get("healthRecommendations") or health_advisory(status, aqi, _dominant_label(dominant_key))
    else:
        components = fetch_from_openweather(lat, lon)
        if components:
            source = "openweather"
        else:
            components = build_mock_components(lat, lon)
        calc = compute_aqi(components)
        aqi = max(30, calc["aqi"])
        dominant_key = calc["dominant"]
        status = aqi_category(aqi)
        advisory = health_advisory(status, aqi, _dominant_label(dominant_key))

    change = random.randint(-12, 15)

    return {
        "aqi": aqi,
        "status": status,
        "dominantPollutant": _dominant_label(dominant_key),
        "healthAdvisory": advisory,
        "location": {
            "name": name,
            "latitude": lat,
            "longitude": lon,
            "region": region,
            "country": country,
        },
        "pollutants": pollutants_from_components(components, dominant_key),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "change24h": change,
        "historical": build_historical(aqi, components),
        "source": source,
    }
