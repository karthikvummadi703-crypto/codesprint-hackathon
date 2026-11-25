"""Centralized configuration for the AirGuard AI backend.

All environment access goes through this module so that:

* Required variables can be validated once, at startup.
* Missing variables are reported by *name* only, never by value.
* Secrets are read in exactly one place and never logged.
"""

from __future__ import annotations

import os as os
from dataclasses import dataclass as dataclass
from dataclasses import field as field
from functools import lru_cache

from config_parts.env import (
    _TRUE as _TRUE,
)
from config_parts.env import (
    _env as _env,
)
from config_parts.env import (
    _env_bool as _env_bool,
)
from config_parts.env import (
    _env_float as _env_float,
)
from config_parts.env import (
    _env_int as _env_int,
)
from config_parts.env import (
    _env_list as _env_list,
)
from config_parts.env import (
    detect_environment as detect_environment,
)
from config_parts.origins import (
    _LOOPBACK_PREFIXES as _LOOPBACK_PREFIXES,
)
from config_parts.origins import (
    PRODUCTION_ORIGINS as PRODUCTION_ORIGINS,
)
from config_parts.origins import (
    _default_dev_auth as _default_dev_auth,
)
from config_parts.origins import (
    _default_origins as _default_origins,
)
from config_parts.report import describe_configuration as describe_configuration
from config_parts.settings import Settings as Settings


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    environment = detect_environment()
    return Settings(
        environment=environment,
        allowed_origins=tuple(_default_origins()),
        allow_dev_auth=_default_dev_auth(environment),
        llm_api_key=_env("LLM_API_KEY"),
        llm_base_url=_env("LLM_BASE_URL", "https://api.openai.com/v1"),
        llm_model=_env("LLM_MODEL", "gpt-4o-mini"),
        llm_fallback_models=tuple(_env_list("LLM_FALLBACK_MODELS")),
        llm_reasoning_effort=_env("LLM_REASONING_EFFORT"),
        llm_timeout_s=_env_float("LLM_TIMEOUT_S", 20.0),
        llm_total_budget_s=_env_float("LLM_TOTAL_BUDGET_S", 18.0),
        llm_max_tokens=_env_int("LLM_MAX_TOKENS", 700),
        llm_temperature=_env_float("LLM_TEMPERATURE", 0.6),
        openweather_key=_env("OPENWEATHER_APPID") or _env("AIR_QUALITY_API_KEY"),
        google_aq_api_key=_env("GOOGLE_AQ_API_KEY") or _env("GOOGLE_AIR_QUALITY_API_KEY"),
        open_meteo_base_url=_env("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1"),
        open_meteo_air_base_url=_env("OPEN_METEO_AIR_BASE_URL", "https://air-quality-api.open-meteo.com/v1"),
        nominatim_base_url=_env("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"),
        nominatim_user_agent=_env("NOMINATIM_USER_AGENT", "AirGuard-AI/2.0"),
        firebase_project_id=_env("FIREBASE_PROJECT_ID"),
        firebase_client_email=_env("FIREBASE_CLIENT_EMAIL"),
        firebase_private_key=_env("FIREBASE_PRIVATE_KEY").replace("\\n", "\n"),
        cache_ttl_aqi_s=_env_int("CACHE_TTL_AQI_S", 600),
        cache_ttl_weather_s=_env_int("CACHE_TTL_WEATHER_S", 900),
        cache_ttl_geocode_s=_env_int("CACHE_TTL_GEOCODE_S", 86_400),
        cache_max_entries=_env_int("CACHE_MAX_ENTRIES", 512),
        http_timeout_s=_env_float("HTTP_TIMEOUT_S", 10.0),
        http_max_retries=_env_int("HTTP_MAX_RETRIES", 2),
        rate_limit_enabled=_env_bool("RATE_LIMIT_ENABLED", True),
        rate_limit_requests=_env_int("RATE_LIMIT_REQUESTS", 120),
        rate_limit_window_s=_env_int("RATE_LIMIT_WINDOW_S", 60),
        rate_limit_chat_requests=_env_int("RATE_LIMIT_CHAT_REQUESTS", 15),
        rate_limit_chat_window_s=_env_int("RATE_LIMIT_CHAT_WINDOW_S", 300),
        max_upload_bytes=_env_int("MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
        log_level=_env("LOG_LEVEL", "INFO").upper(),
        is_production=environment in {"production", "prod"},
    )
