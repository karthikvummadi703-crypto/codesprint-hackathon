"""Geocoding and place search schemas."""

from __future__ import annotations

from pydantic import BaseModel


class PlaceOut(BaseModel):
    name: str
    latitude: float
    longitude: float
    region: str = ""
    country: str = ""
    label: str = ""


class PlaceSearchResponse(BaseModel):
    places: list[PlaceOut]
