"""Air-quality, history and forecast response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from schemas_common import AQIStatusLiteral, LocationOut


class PollutantOut(BaseModel):
    id: str
    name: str
    value: float
    unit: str
    status: Literal["Good", "High"]
    description: str
    safeLimit: float
    subIndex: int | None = None


class HistoricalPointOut(BaseModel):
    time: str
    aqi: int
    pm25: float
    pm10: float
    no2: float
    so2: float
    co: float
    o3: float


class AirQualityResponse(BaseModel):
    aqi: int
    status: AQIStatusLiteral
    dominantPollutant: str
    healthAdvisory: str
    location: LocationOut
    pollutants: list[PollutantOut]
    timestamp: str
    change24h: int | None = None
    historical: list[HistoricalPointOut] = Field(default_factory=list)
    source: str
    isEstimated: bool
    forecastAvailable: bool = False


class HistoricalDayOut(BaseModel):
    date: str
    aqiMean: int
    aqiMax: int
    aqiMin: int
    dominant: str
    pm25: float
    pm10: float


class AqiHistoryResponse(BaseModel):
    location: LocationOut
    startDate: str
    endDate: str
    points: list[HistoricalDayOut]
    source: str
    timestamp: str


class ForecastPointOut(BaseModel):
    timeOffsetHours: int
    label: str
    timestamp: str
    aqi: int
    confidence: int
    pm25: float
    pm10: float
    no2: float
    so2: float
    co: float
    o3: float
    dominantPollutant: str
    status: AQIStatusLiteral


class PredictionsResponse(BaseModel):
    predictions: list[ForecastPointOut]
    location: LocationOut
    source: str
    method: Literal["provider-forecast", "heuristic-prototype"]
    horizonHours: int
    note: str
    timestamp: str
