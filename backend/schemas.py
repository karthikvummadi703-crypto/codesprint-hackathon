"""Pydantic request/response schemas for every route.

Schemas are intentionally narrower than the raw provider payloads: internal
fields (raw provider components, upstream URLs, model identifiers) are dropped at
the boundary so the frontend never depends on provider response shape.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

AQIStatusLiteral = Literal[
    "Good",
    "Moderate",
    "Unhealthy for Sensitive Groups",
    "Unhealthy",
    "Very Unhealthy",
    "Hazardous",
]


class LocationOut(BaseModel):
    name: str
    latitude: float
    longitude: float
    region: str = ""
    country: str = ""
    source: Literal["coordinates", "geocoded", "default"] = "coordinates"


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


class CurrentWeatherOut(BaseModel):
    temperature: float
    feelsLike: float
    humidity: int
    windSpeed: float
    windDirection: int
    precipitation: float
    cloudCover: int
    pressure: float
    uvIndex: float | None = None
    visibility: float | None = None
    isDay: bool
    condition: str
    conditionCode: int
    observedAt: str
    precipitationProbability: int | None = None


class HourlyWeatherOut(BaseModel):
    timestamp: str
    temperature: float
    apparentTemperature: float
    humidity: int
    precipitation: float
    precipitationProbability: int
    windSpeed: float
    windDirection: int
    cloudCover: int
    condition: str
    conditionCode: int
    uvIndex: float | None = None


class DailyWeatherOut(BaseModel):
    date: str
    condition: str
    conditionCode: int
    temperatureMax: float
    temperatureMin: float
    precipitationSum: float
    precipitationProbabilityMax: int
    windSpeedMax: float
    windDirectionDominant: int
    uvIndexMax: float | None = None
    sunrise: str | None = None
    sunset: str | None = None


class WeatherResponse(BaseModel):
    location: LocationOut
    current: CurrentWeatherOut
    hourly: list[HourlyWeatherOut]
    daily: list[DailyWeatherOut]
    units: dict[str, str]
    source: str
    timestamp: str


class PlaceOut(BaseModel):
    name: str
    latitude: float
    longitude: float
    region: str = ""
    country: str = ""
    label: str = ""


class PlaceSearchResponse(BaseModel):
    places: list[PlaceOut]


class ChatTurnIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def strip_control_chars(cls, value: str) -> str:
        return "".join(ch for ch in value if ch == "\n" or ch == "\t" or ch.isprintable()).strip()


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    location: dict[str, Any] | None = None
    aqHistory: list[dict[str, Any]] | None = Field(default=None, max_length=50)
    carbonTrips: list[dict[str, Any]] | None = Field(default=None, max_length=200)
    predictions: list[dict[str, Any]] | None = Field(default=None, max_length=50)
    weather: dict[str, Any] | None = None
    history: list[ChatTurnIn] | None = Field(default=None, max_length=40)
    # Documents attached to this specific turn. Retrieval is scoped to these ids
    # inside the caller's own knowledge base, so a question that does not use
    # document wording ("compare that with today") still reads the attachment.
    documentIds: list[str] | None = Field(default=None, max_length=5)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        cleaned = "".join(ch for ch in value if ch == "\n" or ch == "\t" or ch.isprintable())
        cleaned = cleaned.strip()
        if not cleaned:
            raise ValueError("message must contain printable characters")
        return cleaned

    @field_validator("documentIds")
    @classmethod
    def clean_document_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
        return cleaned or None


class ChatResponse(BaseModel):
    response: str
    contextUsed: bool
    intent: str
    contextSections: list[str]
    provider: str
    latencyMs: int
    degraded: bool = False
    dataCoverage: dict[str, bool] = Field(default_factory=dict)


class RagUploadResponse(BaseModel):
    fileId: str
    fileName: str
    chunkCount: int
    textPreview: str


class RagFileOut(BaseModel):
    fileId: str
    fileName: str
    chunkCount: int


class RagFileListResponse(BaseModel):
    files: list[RagFileOut]


class CarbonRequest(BaseModel):
    origin: str = Field(..., min_length=1, max_length=200)
    destination: str = Field(..., min_length=1, max_length=200)
    distanceKm: float | None = Field(default=None, gt=0, le=20_000)
    mode: str = Field(default="Car", max_length=32)

    @field_validator("origin", "destination")
    @classmethod
    def clean_place(cls, value: str) -> str:
        return value.strip()


class DistanceRequest(BaseModel):
    origin: str = Field(..., min_length=1, max_length=200)
    destination: str = Field(..., min_length=1, max_length=200)

    @field_validator("origin", "destination")
    @classmethod
    def clean_place(cls, value: str) -> str:
        return value.strip()


class DistanceResponse(BaseModel):
    distanceKm: float


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    capabilities: dict[str, Any]
    cache: dict[str, Any]


class CoordinatesQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
