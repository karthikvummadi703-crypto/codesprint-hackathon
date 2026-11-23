"""Tolerant numeric coercion helpers for provider payloads."""

from __future__ import annotations

from typing import Any


def _at(series: dict[str, Any], field: str, index: int) -> Any:
    values = series.get(field)
    if not values or index >= len(values):
        return None
    return values[index]


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _as_opt_float(value: Any) -> float | None:
    """Like `_as_float` but preserves "not reported" as None instead of 0.0.

    Used for fields the schema marks optional: reporting UV index 0 or visibility
    0 when the provider omitted them would render as a real reading.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
