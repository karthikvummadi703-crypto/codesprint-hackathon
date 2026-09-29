"""Centralized configuration for the AirGuard AI backend.

All environment access goes through this module so that:

* Required variables can be validated once, at startup.
* Missing variables are reported by *name* only, never by value.
* Secrets are read in exactly one place and never logged.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache

_TRUE = {"1", "true", "yes", "on"}


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return value.strip() if isinstance(value, str) else default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in _TRUE


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw or not raw.strip():
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def _env_list(name: str, default: str = "") -> list[str]:
    raw = _env(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    environment: str = "development"
    allowed_origins: tuple[str, ...] = ("http://localhost:5173",)
    allow_dev_auth: bool = True

    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_fallback_models: tuple[str, ...] = ()
    llm_reasoning_effort: str = ""
    llm_timeout_s: float = 20.0
    llm_total_budget_s: float = 18.0
    llm_max_tokens: int = 700
    llm_temperature: float = 0.6

    openweather_key: str = ""
    google_aq_api_key: str = ""
    open_meteo_base_url: str = "https://api.open-meteo.com/v1"
    open_meteo_air_base_url: str = "https://air-quality-api.open-meteo.com/v1"

    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "AirGuard-AI/2.0 (environmental-intelligence)"

    firebase_project_id: str = ""
    firebase_client_email: str = ""
    firebase_private_key: str = ""

    cache_ttl_aqi_s: int = 600
    cache_ttl_weather_s: int = 900
    cache_ttl_geocode_s: int = 86_400
    cache_max_entries: int = 512

    http_timeout_s: float = 10.0
    http_max_retries: int = 2

    rate_limit_enabled: bool = True
    rate_limit_requests: int = 120
    rate_limit_window_s: int = 60
    rate_limit_chat_requests: int = 15
    rate_limit_chat_window_s: int = 300

    max_upload_bytes: int = 10 * 1024 * 1024
    log_level: str = "INFO"

    is_production: bool = field(default=False)

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def llm_model_chain(self) -> tuple[str, ...]:
        """Models to try in order, primary first.

        Free-tier endpoints go rate-limited independently and unpredictably, so
        a single model name turns one provider's 429 into a dead assistant. The
        chain lets the caller move to a different model instead of straight to the
        grounded fallback. Duplicates are dropped so a model repeated in the env
        list is not retried against the same rate limit.
        """
        chain: list[str] = []
        for model in (self.llm_model, *self.llm_fallback_models):
            name = (model or "").strip()
            if name and name not in chain:
                chain.append(name)
        return tuple(chain)

    @property
    def aqi_provider_configured(self) -> bool:
        """True when at least one real air-quality provider has credentials.

        Open-Meteo needs no key, so the service is always usable; this flag only
        reports whether the *keyed* providers (Google, OpenWeather) are set up.
        """
        return bool(self.google_aq_api_key or self.openweather_key)

    @property
    def firebase_admin_configured(self) -> bool:
        return bool(
            self.firebase_project_id
            and self.firebase_client_email
            and self.firebase_private_key
        )


PRODUCTION_ORIGINS = (
    "https://codesprint-hackathon.web.app",
    "https://codesprint-hackathon.firebaseapp.com",
)

_LOOPBACK_PREFIXES = ("http://localhost", "http://127.0.0.1", "http://[::1]")


def _default_origins() -> list[str]:
    """CORS allow-list.

    In production the deployed frontend origins are always present, even when
    `ALLOWED_ORIGINS` is set. A leftover localhost-only value in `.env` would
    otherwise ship a backend that the real browser app cannot call at all,
    which is a silent, total outage rather than a visible error.
    """
    env_name = _env("ENVIRONMENT", "development").lower()
    is_production = env_name in {"production", "prod"}

    configured = _env_list("ALLOWED_ORIGINS") if _env("ALLOWED_ORIGINS") else []
    origins: list[str] = []

    for origin in configured:
        # A loopback entry is meaningless in production and only widens exposure.
        if is_production and origin.startswith(_LOOPBACK_PREFIXES):
            continue
        if origin not in origins:
            origins.append(origin)

    if is_production:
        for origin in PRODUCTION_ORIGINS:
            if origin not in origins:
                origins.append(origin)
    elif not origins:
        origins = [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
        ]

    return origins


def _default_dev_auth(environment: str) -> bool:
    """`dev:` tokens are a local-only convenience and must never be enabled in production."""
    if _env("ALLOW_DEV_AUTH"):
        return _env_bool("ALLOW_DEV_AUTH", False)
    return environment.lower() not in {"production", "prod"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    environment = _env("ENVIRONMENT", "development").lower()
    return Settings(
        environment=environment,
        allowed_origins=tuple(_default_origins()),
        allow_dev_auth=_default_dev_auth(environment),
        llm_api_key=_env("LLM_API_KEY"),
        llm_base_url=_env("LLM_BASE_URL", "https://api.openai.com/v1"),
        llm_model=_env("LLM_MODEL", "gpt-4o-mini"),
        llm_fallback_models=_env_list("LLM_FALLBACK_MODELS"),
        llm_reasoning_effort=_env("LLM_REASONING_EFFORT"),
        llm_timeout_s=_env_float("LLM_TIMEOUT_S", 20.0),
        llm_total_budget_s=_env_float("LLM_TOTAL_BUDGET_S", 18.0),
        llm_max_tokens=_env_int("LLM_MAX_TOKENS", 700),
        llm_temperature=_env_float("LLM_TEMPERATURE", 0.6),
        openweather_key=_env("OPENWEATHER_APPID") or _env("AIR_QUALITY_API_KEY"),
        google_aq_api_key=_env("GOOGLE_AQ_API_KEY") or _env("GOOGLE_AIR_QUALITY_API_KEY"),
        open_meteo_base_url=_env("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1"),
        open_meteo_air_base_url=_env(
            "OPEN_METEO_AIR_BASE_URL", "https://air-quality-api.open-meteo.com/v1"
        ),
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


def describe_configuration(settings: Settings) -> dict:
    """Capability report for /api/health and startup logs.

    Reports only boolean presence — never any secret material.
    """
    return {
        "environment": settings.environment,
        "llm_configured": settings.llm_configured,
        "google_air_quality_configured": bool(settings.google_aq_api_key),
        "openweather_configured": bool(settings.openweather_key),
        "open_meteo_configured": True,
        "firebase_admin_configured": settings.firebase_admin_configured,
        "dev_auth_enabled": settings.allow_dev_auth,
        "rate_limiting_enabled": settings.rate_limit_enabled,
    }
