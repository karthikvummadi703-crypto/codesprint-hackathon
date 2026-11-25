"""Shared AQI status and location schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

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
