"""Non-secret capability report built from settings."""

from __future__ import annotations

from config_parts.settings import Settings


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
