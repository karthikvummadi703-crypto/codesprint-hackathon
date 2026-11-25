"""CORS and local-auth defaults derived from the environment."""

from __future__ import annotations

from config_parts.env import _env, _env_bool, _env_list, detect_environment

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
    is_production = detect_environment() in {"production", "prod"}

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
    else:
        # Keep both loopback spellings available locally. A developer may open
        # `localhost` while Vite binds to `127.0.0.1` (or vice versa), and an
        # explicit ALLOWED_ORIGINS value must not turn the other spelling into a
        # silent CORS failure.
        for origin in (
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ):
            if origin not in origins:
                origins.append(origin)

    return origins


def _default_dev_auth(environment: str) -> bool:
    """`dev:` tokens are a local-only convenience and must never be enabled in production."""
    if environment.lower() in {"production", "prod"}:
        return False
    if _env("ALLOW_DEV_AUTH"):
        return _env_bool("ALLOW_DEV_AUTH", False)
    return True
