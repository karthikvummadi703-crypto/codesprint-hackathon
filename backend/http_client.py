"""Shared async HTTP client for every outbound provider call.

One pooled `httpx.AsyncClient` is reused for the whole process (connection
re-use), with a single timeout policy, bounded retries that skip non-idempotent
or permanently-failing requests, and normalized error reporting that never logs
credentials.
"""

from __future__ import annotations

import asyncio
from typing import Any, Mapping

import httpx

from config import get_settings
from logging_config import get_logger, redact

log = get_logger("airguard.http")

_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


class ProviderError(RuntimeError):
    """An upstream provider failed in a way the caller should treat as unavailable."""

    def __init__(self, provider: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.provider = provider
        self.status = status


def _build_client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(
        timeout=httpx.Timeout(settings.http_timeout_s, connect=min(5.0, settings.http_timeout_s)),
        limits=httpx.Limits(max_connections=40, max_keepalive_connections=20, keepalive_expiry=30.0),
        follow_redirects=True,
        headers={"User-Agent": settings.nominatim_user_agent},
    )


_client: httpx.AsyncClient | None = None
_client_lock: asyncio.Lock | None = None
_client_loop: asyncio.AbstractEventLoop | None = None


def _lock() -> asyncio.Lock:
    """A lock bound to the running loop.

    An `asyncio.Lock` caches its loop on first use in some Python versions, so a
    process-wide lock created at import time breaks when a different loop runs
    next (tests, or an unusual worker setup).
    """
    global _client_lock
    if _client_lock is None:
        _client_lock = asyncio.Lock()
    return _client_lock


async def get_client() -> httpx.AsyncClient:
    """Return the pooled client, rebuilding it if the event loop changed.

    An `httpx.AsyncClient` holds connections tied to the loop that opened them.
    Reusing one across loops leaks sockets and eventually raises
    "Event loop is closed" on teardown, so the pool is scoped to its loop.
    """
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is not None and not _client.is_closed and _client_loop is loop:
        return _client
    async with _lock():
        if _client is None or _client.is_closed or _client_loop is not loop:
            _client = _build_client()
            _client_loop = loop
    return _client


async def close_client() -> None:
    global _client, _client_loop
    client, _client, _client_loop = _client, None, None
    if client is None or client.is_closed:
        return
    try:
        await client.aclose()
    except RuntimeError as exc:  # loop already gone; nothing left to release
        log.debug("http client close skipped: %s", exc)


async def request_json(
    method: str,
    url: str,
    *,
    provider: str,
    params: Mapping[str, Any] | None = None,
    json_body: Any | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float | None = None,
    retries: int | None = None,
    retry_statuses: frozenset[int] | None = None,
) -> Any:
    """Perform an HTTP request and return decoded JSON, or raise ProviderError.

    Retries are limited to transient conditions: network errors, timeouts, and
    408/425/429/5xx. A 4xx such as 401 or 400 is permanent and is raised
    immediately rather than retried.

    `retry_statuses` narrows the retryable status set for a specific call. A
    shared free-tier model is the reason this exists: retrying a 429 just after
    the provider rejected it burns the backoff delay and still fails, so the LLM
    call passes a set without 429 and falls back immediately instead.
    """
    settings = get_settings()
    max_attempts = (retries if retries is not None else settings.http_max_retries) + 1
    retryable = _RETRYABLE_STATUS if retry_statuses is None else retry_statuses
    client = await get_client()
    last_error: str = "unknown error"

    for attempt in range(1, max_attempts + 1):
        try:
            response = await client.request(
                method,
                url,
                params=params,
                json=json_body,
                headers=headers,
                timeout=timeout or settings.http_timeout_s,
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = f"{type(exc).__name__}"
            log.warning(
                "%s %s transport failure attempt=%d/%d: %s",
                provider,
                url.split("?")[0],
                attempt,
                max_attempts,
                last_error,
            )
            if attempt >= max_attempts:
                raise ProviderError(provider, f"{provider} unreachable", None) from exc
            await asyncio.sleep(min(2.0 * attempt, 5.0))
            continue

        if response.status_code == 200:
            try:
                return response.json()
            except ValueError as exc:
                raise ProviderError(provider, f"{provider} returned malformed JSON", 200) from exc

        if response.status_code in retryable and attempt < max_attempts:
            backoff = _retry_after_seconds(response) or min(2.0 * attempt, 8.0)
            log.warning(
                "%s retryable status=%d attempt=%d/%d backoff=%.1fs",
                provider,
                response.status_code,
                attempt,
                max_attempts,
                backoff,
            )
            await asyncio.sleep(backoff)
            continue

        detail = redact(response.text)
        log.warning("%s failed status=%d: %s", provider, response.status_code, detail)
        raise ProviderError(
            provider,
            f"{provider} returned HTTP {response.status_code}",
            response.status_code,
        )

    raise ProviderError(provider, f"{provider} unreachable", None)


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, min(float(raw), 15.0))
    except ValueError:
        return None
