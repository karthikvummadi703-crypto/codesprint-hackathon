"""Typed settings model."""

from __future__ import annotations

from dataclasses import dataclass, field


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
        return bool(self.firebase_project_id and self.firebase_client_email and self.firebase_private_key)
