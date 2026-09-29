"""Request middleware: timing instrumentation and rate limiting.

Rate limiting uses a fixed-window counter keyed by user id when the caller is
authenticated and by client IP otherwise, so one user cannot exhaust the shared
LLM budget for everyone else.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from config import get_settings
from logging_config import get_logger

log = get_logger("airguard.http.access")

# Endpoints with their own, tighter budget.
_COSTLY_PATHS = {"/api/ai/chat", "/api/rag/upload"}


class _FixedWindowCounter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = time.monotonic

    def hit(self, key: str, limit: int, window_s: int) -> tuple[bool, int]:
        now = time.monotonic()
        bucket = self._hits[key]
        cutoff = now - window_s
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window_s - (now - bucket[0])) + 1)
            return False, retry_after
        bucket.append(now)
        return True, 0

    def reset(self) -> None:
        self._hits.clear()


_counters = _FixedWindowCounter()


def _identity(request: Request) -> str:
    uid = getattr(request.state, "uid", None)
    if uid:
        return f"uid:{uid}"
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        started = time.perf_counter()
        response: Response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        if request.url.path.startswith("/api/"):
            log.info(
                "%s %s -> %s in %dms",
                request.method,
                request.url.path,
                response.status_code,
                elapsed_ms,
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        path = request.url.path
        if not settings.rate_limit_enabled or not path.startswith("/api/") or request.method == "OPTIONS":
            return await call_next(request)

        if path in _COSTLY_PATHS:
            limit, window = settings.rate_limit_chat_requests, settings.rate_limit_chat_window_s
        else:
            limit, window = settings.rate_limit_requests, settings.rate_limit_window_s

        key = f"{_identity(request)}:{path}:{limit}"
        allowed, retry_after = _counters.hit(key, limit, window)
        if not allowed:
            log.warning("rate limit exceeded identity=%s path=%s", key.split(":", 1)[0], path)
            from fastapi.responses import JSONResponse

            return JSONResponse(
                {"detail": "Too many requests. Please wait a moment and try again."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Window"] = str(window)
        return response
