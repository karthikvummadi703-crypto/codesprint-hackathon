"""Weather request and response schemas."""

from __future__ import annotations

from pydantic import BaseModel

from schema_models.common import LocationOut


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
