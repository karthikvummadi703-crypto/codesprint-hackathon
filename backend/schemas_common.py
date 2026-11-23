"""Shared location, place, health and query schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

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


class PlaceOut(BaseModel):
    name: str
    latitude: float
    longitude: float
    region: str = ""
    country: str = ""
    label: str = ""


class PlaceSearchResponse(BaseModel):
    places: list[PlaceOut]


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    capabilities: dict[str, Any]
    cache: dict[str, Any]


class CoordinatesQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
