"""Request middleware: security headers, timing instrumentation and rate limiting.

Rate limiting uses a fixed-window counter keyed by the verified user id when a
token is supplied and by the socket peer address otherwise. Middleware runs
before route dependencies, so authentication is resolved here explicitly rather
than relying on a state value that has not been populated yet.
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

_CSP = (
    "default-src 'self'; "
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com "
    "wss://*.googleapis.com wss://*.firebaseio.com; "
    "worker-src 'self' blob:"
)


class _FixedWindowCounter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._calls = 0

    def hit(self, key: str, limit: int, window_s: int) -> tuple[bool, int]:
        self._calls += 1
        if self._calls % 256 == 0:
            self._prune()
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

    def _prune(self) -> None:
        for key in [key for key, bucket in self._hits.items() if not bucket]:
            del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()


_counters = _FixedWindowCounter()


async def _identity(request: Request) -> str:
    """Verified uid for authenticated callers, socket peer address otherwise.

    `x-forwarded-for` is deliberately ignored: it is a client-controlled header
    unless a trusted proxy is configured in front of the app, and honouring it
    here would make every limit trivially bypassable.
    """
    uid = getattr(request.state, "uid", None)
    if uid:
        return f"uid:{uid}"
    if request.headers.get("Authorization"):
        try:
            from services.security import get_uid

            return f"uid:{await get_uid(request)}"
        except Exception:  # noqa: S110 - route reports the precise auth error
            # The route will produce the precise auth error; for limiting, the
            # peer address is a sufficient fallback for an unverified caller.
            pass
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        headers = response.headers
        headers.setdefault("Content-Security-Policy", _CSP)
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
        )
        if get_settings().is_production:
            headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains; preload",
            )
        return response


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

        identity = await _identity(request)
        key = f"{identity}:{path}:{limit}"
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
