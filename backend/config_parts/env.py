"""Environment-variable parsing helpers."""

from __future__ import annotations

import os as os

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


def detect_environment() -> str:
    """Resolve the runtime environment without trusting an unset variable.

    Hosted platforms always inject one of these signals. Treating them as
    production closes the common deployment mistake where `ENVIRONMENT` is
    omitted and dev tokens silently stay enabled.
    """
    explicit = _env("ENVIRONMENT").lower()
    if explicit:
        return explicit
    if _env("VERCEL") or _env("PORT") or _env("RAILWAY_ENVIRONMENT"):
        return "production"
    return "development"
