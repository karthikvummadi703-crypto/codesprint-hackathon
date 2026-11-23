"""Environment, CORS, dev-auth, production-guard and config-value validation."""

from __future__ import annotations

import pytest

from config import (
    PRODUCTION_ORIGINS,
    Settings,
    describe_configuration,
    detect_environment,
    get_settings,
)

_CONFIG_ENV_NAMES = (
    "ENVIRONMENT",
    "VERCEL",
    "PORT",
    "RAILWAY_ENVIRONMENT",
    "ALLOWED_ORIGINS",
    "ALLOW_DEV_AUTH",
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "LLM_FALLBACK_MODELS",
    "LLM_REASONING_EFFORT",
    "LLM_TIMEOUT_S",
    "LLM_TOTAL_BUDGET_S",
    "LLM_MAX_TOKENS",
    "LLM_TEMPERATURE",
    "OPENWEATHER_APPID",
    "AIR_QUALITY_API_KEY",
    "GOOGLE_AQ_API_KEY",
    "GOOGLE_AIR_QUALITY_API_KEY",
    "OPEN_METEO_BASE_URL",
    "OPEN_METEO_AIR_BASE_URL",
    "NOMINATIM_BASE_URL",
    "NOMINATIM_USER_AGENT",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "CACHE_TTL_AQI_S",
    "CACHE_TTL_WEATHER_S",
    "CACHE_TTL_GEOCODE_S",
    "CACHE_MAX_ENTRIES",
    "HTTP_TIMEOUT_S",
    "HTTP_MAX_RETRIES",
    "RATE_LIMIT_ENABLED",
    "RATE_LIMIT_REQUESTS",
    "RATE_LIMIT_WINDOW_S",
    "RATE_LIMIT_CHAT_REQUESTS",
    "RATE_LIMIT_CHAT_WINDOW_S",
    "MAX_UPLOAD_BYTES",
    "LOG_LEVEL",
)


@pytest.fixture(autouse=True)
def _clean_config_environment(monkeypatch):
    for name in _CONFIG_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestEnvironmentDetection:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("Production", "production"), ("prod", "prod"), ("Staging", "staging")],
    )
    def test_explicit_environment_is_lowercased(self, monkeypatch, raw, expected):
        monkeypatch.setenv("ENVIRONMENT", raw)
        assert detect_environment() == expected

    @pytest.mark.parametrize("name", ["VERCEL", "PORT", "RAILWAY_ENVIRONMENT"])
    def test_host_signals_imply_production(self, monkeypatch, name):
        monkeypatch.setenv(name, "1")
        assert detect_environment() == "production"
        assert get_settings().is_production is True

    def test_no_signals_default_to_development(self):
        assert detect_environment() == "development"
        assert get_settings().environment == "development"

    def test_explicit_environment_overrides_host_signal(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "Staging")
        monkeypatch.setenv("PORT", "8080")
        assert detect_environment() == "staging"
        assert get_settings().is_production is False


class TestCorsValidation:
    def test_development_origins_include_both_loopback_spellings(self):
        origins = get_settings().allowed_origins
        for expected in (
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ):
            assert expected in origins
        assert "" not in origins

    def test_configured_origins_are_trimmed_and_deduplicated(self, monkeypatch):
        monkeypatch.setenv("ALLOWED_ORIGINS", " https://a.example , ,https://a.example ")
        origins = get_settings().allowed_origins
        assert origins.count("https://a.example") == 1
        assert "" not in origins
        assert "http://localhost:5173" in origins

    def test_production_always_includes_deployed_origins(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("ALLOWED_ORIGINS", "https://custom.example")
        origins = get_settings().allowed_origins
        assert all(origin in origins for origin in PRODUCTION_ORIGINS)
        assert "https://custom.example" in origins

    def test_production_drops_loopback_origins(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173,https://custom.example",
        )
        origins = get_settings().allowed_origins
        assert not any(origin.startswith("http://") for origin in origins)
        assert "https://custom.example" in origins
        assert all(origin in origins for origin in PRODUCTION_ORIGINS)

    def test_prod_alias_uses_production_origins(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "prod")
        origins = get_settings().allowed_origins
        assert all(origin in origins for origin in PRODUCTION_ORIGINS)
        assert "http://localhost:5173" not in origins


class TestDevAuthGuard:
    def test_defaults_to_true_outside_production(self):
        assert get_settings().allow_dev_auth is True

    @pytest.mark.parametrize("raw", ["1", "true", "TRUE", "Yes", "ON", " yes "])
    def test_truthy_values_enable_dev_auth(self, monkeypatch, raw):
        monkeypatch.setenv("ALLOW_DEV_AUTH", raw)
        assert get_settings().allow_dev_auth is True

    @pytest.mark.parametrize("raw", ["0", "false", "NO", "off", "garbage", "2"])
    def test_falsy_values_disable_dev_auth(self, monkeypatch, raw):
        monkeypatch.setenv("ALLOW_DEV_AUTH", raw)
        assert get_settings().allow_dev_auth is False

    def test_blank_value_uses_default(self, monkeypatch):
        monkeypatch.setenv("ALLOW_DEV_AUTH", "   ")
        assert get_settings().allow_dev_auth is True

    @pytest.mark.parametrize("environment", ["production", "prod"])
    def test_production_never_enables_dev_auth(self, monkeypatch, environment):
        monkeypatch.setenv("ENVIRONMENT", environment)
        monkeypatch.setenv("ALLOW_DEV_AUTH", "true")
        settings = get_settings()
        assert settings.allow_dev_auth is False
        assert describe_configuration(settings)["dev_auth_enabled"] is False

    def test_production_signal_without_explicit_environment_disables_dev_auth(self, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.setenv("ALLOW_DEV_AUTH", "true")
        assert get_settings().allow_dev_auth is False


class TestProductionGuards:
    @pytest.mark.parametrize(
        ("environment", "expected"),
        [
            ("production", True),
            ("prod", True),
            ("Production", True),
            ("PROD", True),
            ("development", False),
            ("test", False),
            ("staging", False),
        ],
    )
    def test_is_production_flag(self, monkeypatch, environment, expected):
        monkeypatch.setenv("ENVIRONMENT", environment)
        assert get_settings().is_production is expected

    def test_firebase_admin_requires_all_three_fields(self, monkeypatch):
        monkeypatch.setenv("FIREBASE_PROJECT_ID", "project")
        get_settings.cache_clear()
        assert get_settings().firebase_admin_configured is False

        monkeypatch.setenv("FIREBASE_CLIENT_EMAIL", "admin@example.invalid")
        get_settings.cache_clear()
        assert get_settings().firebase_admin_configured is False

        monkeypatch.setenv("FIREBASE_PRIVATE_KEY", "key")
        get_settings.cache_clear()
        assert get_settings().firebase_admin_configured is True

    def test_blank_firebase_fields_do_not_count_as_configured(self, monkeypatch):
        monkeypatch.setenv("FIREBASE_PROJECT_ID", "   ")
        monkeypatch.setenv("FIREBASE_CLIENT_EMAIL", "   ")
        monkeypatch.setenv("FIREBASE_PRIVATE_KEY", "   ")
        assert get_settings().firebase_admin_configured is False

    def test_firebase_private_key_newlines_are_unescaped(self, monkeypatch):
        monkeypatch.setenv("FIREBASE_PRIVATE_KEY", "first\\nsecond")
        assert get_settings().firebase_private_key == "first\nsecond"

    def test_production_without_firebase_reports_degraded_persistence(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "production")
        report = describe_configuration(get_settings())
        assert report["firebase_admin_configured"] is False
        assert report["dev_auth_enabled"] is False
        assert report["open_meteo_configured"] is True


class TestEdgeConfigValues:
    def test_invalid_floats_fall_back_to_defaults(self, monkeypatch):
        monkeypatch.setenv("LLM_TIMEOUT_S", "abc")
        monkeypatch.setenv("LLM_TOTAL_BUDGET_S", "   ")
        monkeypatch.setenv("HTTP_TIMEOUT_S", "")
        settings = get_settings()
        assert settings.llm_timeout_s == 20.0
        assert settings.llm_total_budget_s == 18.0
        assert settings.http_timeout_s == 10.0

    def test_valid_floats_accept_surrounding_whitespace(self, monkeypatch):
        monkeypatch.setenv("LLM_TEMPERATURE", " 0.25 ")
        monkeypatch.setenv("HTTP_TIMEOUT_S", "2.5")
        settings = get_settings()
        assert settings.llm_temperature == 0.25
        assert settings.http_timeout_s == 2.5

    def test_ints_truncate_floats_and_accept_scientific_notation(self, monkeypatch):
        monkeypatch.setenv("CACHE_TTL_AQI_S", "3.9")
        monkeypatch.setenv("CACHE_MAX_ENTRIES", "1e2")
        monkeypatch.setenv("HTTP_MAX_RETRIES", "-2")
        settings = get_settings()
        assert settings.cache_ttl_aqi_s == 3
        assert settings.cache_max_entries == 100
        assert settings.http_max_retries == -2

    def test_invalid_ints_fall_back_to_defaults(self, monkeypatch):
        monkeypatch.setenv("LLM_MAX_TOKENS", "many")
        monkeypatch.setenv("RATE_LIMIT_REQUESTS", "n/a")
        settings = get_settings()
        assert settings.llm_max_tokens == 700
        assert settings.rate_limit_requests == 120

    def test_env_list_trims_and_drops_blanks(self, monkeypatch):
        monkeypatch.setenv("LLM_MODEL", "primary")
        monkeypatch.setenv("LLM_FALLBACK_MODELS", " a , , b , a ")
        settings = get_settings()
        assert settings.llm_fallback_models == ("a", "b", "a")
        assert settings.llm_model_chain == ("primary", "a", "b")

    def test_model_chain_drops_duplicates_and_blanks_from_settings(self):
        settings = Settings(llm_model="primary", llm_fallback_models=("primary", "  ", "other"))
        assert settings.llm_model_chain == ("primary", "other")
        assert Settings(llm_model="").llm_model_chain == ()

    def test_string_values_are_stripped_and_log_level_uppercased(self, monkeypatch):
        monkeypatch.setenv("NOMINATIM_USER_AGENT", "  Agent/1  ")
        monkeypatch.setenv("LLM_BASE_URL", "  https://llm.invalid/v1  ")
        monkeypatch.setenv("LOG_LEVEL", " debug ")
        settings = get_settings()
        assert settings.nominatim_user_agent == "Agent/1"
        assert settings.llm_base_url == "https://llm.invalid/v1"
        assert settings.log_level == "DEBUG"

    def test_default_user_agent_and_base_urls(self):
        settings = get_settings()
        assert settings.nominatim_user_agent == "AirGuard-AI/2.0"
        assert settings.open_meteo_base_url == "https://api.open-meteo.com/v1"
        assert settings.open_meteo_air_base_url == "https://air-quality-api.open-meteo.com/v1"
        assert settings.nominatim_base_url == "https://nominatim.openstreetmap.org"

    def test_key_aliases_and_precedence(self, monkeypatch):
        monkeypatch.setenv("AIR_QUALITY_API_KEY", "legacy-openweather")
        monkeypatch.setenv("OPENWEATHER_APPID", "primary-openweather")
        monkeypatch.setenv("GOOGLE_AIR_QUALITY_API_KEY", "legacy-google")
        settings = get_settings()
        assert settings.openweather_key == "primary-openweather"
        assert settings.google_aq_api_key == "legacy-google"
        assert settings.aqi_provider_configured is True

    def test_legacy_key_aliases_are_used_when_primary_names_are_absent(self, monkeypatch):
        monkeypatch.setenv("AIR_QUALITY_API_KEY", "legacy-openweather")
        monkeypatch.setenv("GOOGLE_AIR_QUALITY_API_KEY", "legacy-google")
        settings = get_settings()
        assert settings.openweather_key == "legacy-openweather"
        assert settings.google_aq_api_key == "legacy-google"

    def test_capability_properties_without_credentials(self):
        settings = get_settings()
        assert settings.llm_configured is False
        assert settings.aqi_provider_configured is False
        assert settings.firebase_admin_configured is False
        assert Settings(llm_api_key="key").llm_configured is True
        assert Settings(google_aq_api_key="key").aqi_provider_configured is True
        assert Settings(openweather_key="key").aqi_provider_configured is True

    def test_rate_limiting_defaults_to_enabled(self):
        assert get_settings().rate_limit_enabled is True

    def test_describe_configuration_reports_only_flags_and_environment(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("LLM_API_KEY", "secret-value")
        monkeypatch.setenv("GOOGLE_AQ_API_KEY", "google-value")
        monkeypatch.setenv("OPENWEATHER_APPID", "openweather-value")
        report = describe_configuration(get_settings())
        assert report == {
            "environment": "production",
            "llm_configured": True,
            "google_air_quality_configured": True,
            "openweather_configured": True,
            "open_meteo_configured": True,
            "firebase_admin_configured": False,
            "dev_auth_enabled": False,
            "rate_limiting_enabled": True,
        }
        assert all(isinstance(value, (bool, str)) for value in report.values())
        assert "secret-value" not in str(report)

    def test_nonsensical_limits_are_accepted_as_configured(self, monkeypatch):
        monkeypatch.setenv("RATE_LIMIT_REQUESTS", "0")
        monkeypatch.setenv("MAX_UPLOAD_BYTES", "-1")
        monkeypatch.setenv("CACHE_TTL_AQI_S", "-5")
        settings = get_settings()
        assert settings.rate_limit_requests == 0
        assert settings.max_upload_bytes == -1
        assert settings.cache_ttl_aqi_s == -5
