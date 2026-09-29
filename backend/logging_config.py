"""Application logging setup.

A single JSON-ish formatter is used so that slow requests, provider failures and
AI latency can be grepped out of Railway logs. Secrets are never logged: callers
pass already-sanitized messages, and `redact()` is available for provider errors.
"""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False

SENSITIVE_MARKERS = (
    "key=",
    "apikey",
    "api_key",
    "appid",
    "token=",
    "authorization",
    "bearer ",
    "secret",
    "private_key",
    "password",
)


def redact(text: object) -> str:
    """Strip query-string secrets out of provider error text before logging."""
    message = str(text)
    lowered = message.lower()
    for marker in SENSITIVE_MARKERS:
        if marker in lowered:
            return "<redacted: message contained credential-like content>"
    if len(message) > 500:
        return message[:500] + "…"
    return message


class _Formatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        extra = getattr(record, "extra_fields", None) or {}
        base = super().format(record)
        if extra:
            detail = " ".join(f"{k}={v}" for k, v in sorted(extra.items()))
            return f"{base} | {detail}"
        return base


def setup_logging(level: str = "INFO") -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        _Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
