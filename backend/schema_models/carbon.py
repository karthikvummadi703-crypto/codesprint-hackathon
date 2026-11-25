"""Carbon and distance calculation schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


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
