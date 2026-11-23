"""Air quality service package facade."""

from __future__ import annotations

import math
import random
from datetime import date, datetime, timedelta, timezone

from config import get_settings
from http_client import ProviderError, request_json
from logging_config import get_logger
from services import geocoding_service

from . import _aqi, _providers, _service

# module deps/constants used by tests or monkeypatches
from ._aqi import (
    _CO_PPM_DIVISOR,
    _PP_B_DIVISOR,
    CO_BREAKS,
    DOMINANT_LABELS,
    NO2_BREAKS,
    O3_BREAKS,
    PM10_BREAKS,
    PM25_BREAKS,
    POLLUTANT_META,
    SO2_BREAKS,
)
from ._service import _MAX_HISTORY_DAYS, DEFAULT_LOCATION

log = get_logger("airguard.air")

# public/internal functions
aqi_category = _aqi.aqi_category
_sub_index = _aqi._sub_index
compute_aqi = _aqi.compute_aqi
pollutants_from_components = _aqi.pollutants_from_components
health_advisory = _aqi.health_advisory
_normalize_google_components = _aqi._normalize_google_components
_pick_google_index = _aqi._pick_google_index
_normalize_google_status = _aqi._normalize_google_status
_at = _aqi._at
_f = _aqi._f
_opt_float = _aqi._opt_float
_opt_int = _aqi._opt_int

fetch_from_google = _providers.fetch_from_google
fetch_from_open_meteo = _providers.fetch_from_open_meteo
fetch_from_openweather = _providers.fetch_from_openweather
_open_meteo_sub_indices = _providers._open_meteo_sub_indices
fetch_aqi_components = _providers.fetch_aqi_components
fetch_aqi_forecast = _providers.fetch_aqi_forecast
fetch_aqi_history = _providers.fetch_aqi_history
_history_window = _providers._history_window
_mean_components = _providers._mean_components

resolve_location = _service.resolve_location
get_air_quality = _service.get_air_quality
_estimated_change = _service._estimated_change
build_estimated_components = _service.build_estimated_components
build_historical = _service.build_historical

__all__ = [
    "DOMINANT_LABELS",
    "PM25_BREAKS",
    "PM10_BREAKS",
    "NO2_BREAKS",
    "SO2_BREAKS",
    "CO_BREAKS",
    "O3_BREAKS",
    "POLLUTANT_META",
    "DEFAULT_LOCATION",
    "aqi_category",
    "compute_aqi",
    "pollutants_from_components",
    "health_advisory",
    "fetch_from_google",
    "fetch_from_open_meteo",
    "fetch_from_openweather",
    "fetch_aqi_components",
    "fetch_aqi_forecast",
    "fetch_aqi_history",
    "resolve_location",
    "get_air_quality",
    "build_estimated_components",
    "build_historical",
]
