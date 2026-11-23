"""Pydantic request/response schemas for every route.

Schemas are intentionally narrower than the raw provider payloads: internal
fields (raw provider components, upstream URLs, model identifiers) are dropped at
the boundary so the frontend never depends on provider response shape.

The model definitions live in focused sibling modules; every public name is
re-exported here so existing ``from schemas import ...`` imports keep working.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from schemas_air import (
    AirQualityResponse,
    AqiHistoryResponse,
    ForecastPointOut,
    HistoricalDayOut,
    HistoricalPointOut,
    PollutantOut,
    PredictionsResponse,
)
from schemas_carbon import CarbonRequest, DistanceRequest, DistanceResponse
from schemas_chat import (
    ChatRequest,
    ChatResponse,
    ChatTurnIn,
    RagFileListResponse,
    RagFileOut,
    RagUploadResponse,
)
from schemas_common import (
    AQIStatusLiteral,
    CoordinatesQuery,
    HealthResponse,
    LocationOut,
    PlaceOut,
    PlaceSearchResponse,
)
from schemas_weather import (
    CurrentWeatherOut,
    DailyWeatherOut,
    HourlyWeatherOut,
    WeatherResponse,
)

__all__ = [
    "AQIStatusLiteral",
    "AirQualityResponse",
    "Any",
    "AqiHistoryResponse",
    "BaseModel",
    "CarbonRequest",
    "ChatRequest",
    "ChatResponse",
    "ChatTurnIn",
    "CoordinatesQuery",
    "CurrentWeatherOut",
    "DailyWeatherOut",
    "DistanceRequest",
    "DistanceResponse",
    "Field",
    "ForecastPointOut",
    "HealthResponse",
    "HistoricalDayOut",
    "HistoricalPointOut",
    "HourlyWeatherOut",
    "Literal",
    "LocationOut",
    "PlaceOut",
    "PlaceSearchResponse",
    "PollutantOut",
    "PredictionsResponse",
    "RagFileListResponse",
    "RagFileOut",
    "RagUploadResponse",
    "WeatherResponse",
    "field_validator",
]
