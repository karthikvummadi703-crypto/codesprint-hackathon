"""Pydantic request/response schemas for every route.

Schemas are intentionally narrower than the raw provider payloads: internal
fields (raw provider components, upstream URLs, model identifiers) are dropped at
the boundary so the frontend never depends on provider response shape.
"""

from __future__ import annotations

from typing import Any as Any
from typing import Literal as Literal

from pydantic import BaseModel as BaseModel
from pydantic import Field as Field
from pydantic import field_validator as field_validator

from schema_models.air import (
    AirQualityResponse as AirQualityResponse,
)
from schema_models.air import (
    AqiHistoryResponse as AqiHistoryResponse,
)
from schema_models.air import (
    ForecastPointOut as ForecastPointOut,
)
from schema_models.air import (
    HistoricalDayOut as HistoricalDayOut,
)
from schema_models.air import (
    HistoricalPointOut as HistoricalPointOut,
)
from schema_models.air import (
    PollutantOut as PollutantOut,
)
from schema_models.air import (
    PredictionsResponse as PredictionsResponse,
)
from schema_models.carbon import (
    CarbonRequest as CarbonRequest,
)
from schema_models.carbon import (
    DistanceRequest as DistanceRequest,
)
from schema_models.carbon import (
    DistanceResponse as DistanceResponse,
)
from schema_models.chat import (
    ChatRequest as ChatRequest,
)
from schema_models.chat import (
    ChatResponse as ChatResponse,
)
from schema_models.chat import (
    ChatTurnIn as ChatTurnIn,
)
from schema_models.common import AQIStatusLiteral as AQIStatusLiteral
from schema_models.common import LocationOut as LocationOut
from schema_models.geo import PlaceOut as PlaceOut
from schema_models.geo import PlaceSearchResponse as PlaceSearchResponse
from schema_models.rag import (
    RagFileListResponse as RagFileListResponse,
)
from schema_models.rag import (
    RagFileOut as RagFileOut,
)
from schema_models.rag import (
    RagUploadResponse as RagUploadResponse,
)
from schema_models.system import CoordinatesQuery as CoordinatesQuery
from schema_models.system import HealthResponse as HealthResponse
from schema_models.weather import (
    CurrentWeatherOut as CurrentWeatherOut,
)
from schema_models.weather import (
    DailyWeatherOut as DailyWeatherOut,
)
from schema_models.weather import (
    HourlyWeatherOut as HourlyWeatherOut,
)
from schema_models.weather import (
    WeatherResponse as WeatherResponse,
)
