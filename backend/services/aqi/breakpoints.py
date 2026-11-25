"""AQI breakpoint tables and pollutant label mappings."""

DOMINANT_LABELS = {
    "pm25": "PM2.5",
    "pm10": "PM10",
    "o3": "O₃",
    "no2": "NO₂",
    "so2": "SO₂",
    "co": "CO",
}

# Molar conversion: ppb = µg/m³ x 24.45 / molecular_weight, i.e. µg/m³ / divisor.
_PP_B_DIVISOR = {"o3": 1.96, "no2": 1.88, "so2": 2.62}
# CO: mg/m³ / 1.15 -> ppm (mg/m³ = µg/m³ / 1000 first).
_CO_PPM_DIVISOR = 1.15

PM25_BREAKS = [(12, 50), (35.4, 100), (55.4, 150), (150.4, 200), (250.4, 300), (350.4, 400), (500.4, 500)]
PM10_BREAKS = [(54, 50), (154, 100), (254, 150), (354, 200), (424, 300), (504, 400), (604, 500)]
NO2_BREAKS = [(53, 50), (100, 100), (360, 150), (649, 200), (1249, 300), (1649, 400), (2049, 500)]
SO2_BREAKS = [(35, 50), (75, 100), (185, 150), (304, 200), (604, 300), (804, 400), (1004, 500)]
CO_BREAKS = [(4.4, 50), (9.4, 100), (12.4, 150), (15.4, 200), (30.4, 300), (40.4, 400), (50.4, 500)]
O3_BREAKS = [(54, 50), (70, 100), (85, 150), (105, 200), (200, 300), (300, 400), (400, 500)]

POLLUTANT_META = {
    "pm25": {
        "component": "pm2_5",
        "name": "PM2.5",
        "unit": "µg/m³",
        "safeLimit": 35,
        "description": "Fine particulate matter — penetrates deep into the lungs and dominates urban AQI.",
    },
    "pm10": {
        "component": "pm10",
        "name": "PM10",
        "unit": "µg/m³",
        "safeLimit": 150,
        "description": "Coarse particles from road dust, construction and wind-blown soil.",
    },
    "no2": {
        "component": "no2",
        "name": "NO₂",
        "unit": "µg/m³",
        "safeLimit": 100,
        "description": "Nitrogen dioxide from vehicle and industrial combustion.",
    },
    "so2": {
        "component": "so2",
        "name": "SO₂",
        "unit": "µg/m³",
        "safeLimit": 80,
        "description": "Sulfur dioxide from fossil fuel and industrial burning.",
    },
    "co": {
        "component": "co",
        "name": "CO",
        "unit": "mg/m³",
        "safeLimit": 10,
        "description": "Carbon monoxide from incomplete combustion; binds haemoglobin.",
    },
    "o3": {
        "component": "o3",
        "name": "O₃",
        "unit": "µg/m³",
        "safeLimit": 100,
        "description": "Ground-level ozone formed by sunlight reactions on nitrogen oxides.",
    },
}
