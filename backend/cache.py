"""In-process TTL cache used for provider responses.

Keyed by request shape (e.g. rounded coordinates + provider), never by user
identity, so a cache hit is always safe to share between users. Entries expire
after a configurable TTL and the store is bounded to avoid unbounded growth.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from logging_config import get_logger

log = get_logger("airguard.cache")


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TTLCache:
    def __init__(self, max_entries: int = 512) -> None:
        self._max_entries = max(1, max_entries)
        self._store: "OrderedDict[str, _Entry]" = OrderedDict()
        self._lock = asyncio.Lock()
        self.hits = 0
        self.misses = 0

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self.misses += 1
                return None
            if entry.expires_at <= time.monotonic():
                self._store.pop(key, None)
                self.misses += 1
                return None
            self._store.move_to_end(key)
            self.hits += 1
            return entry.value

    async def set(self, key: str, value: Any, ttl_s: int) -> None:
        if ttl_s <= 0:
            return
        async with self._lock:
            self._store[key] = _Entry(value, time.monotonic() + ttl_s)
            self._store.move_to_end(key)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)

    async def invalidate_prefix(self, prefix: str) -> int:
        """Drop every entry whose key starts with `prefix`.

        Used when the active location changes so no response is ever served for a
        previously selected location.
        """
        async with self._lock:
            doomed = [k for k in self._store if k.startswith(prefix)]
            for key in doomed:
                self._store.pop(key, None)
            if doomed:
                log.info("cache invalidated prefix=%s entries=%d", prefix, len(doomed))
            return len(doomed)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        total = self.hits + self.misses
        return {
            "entries": len(self._store),
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": round(self.hits / total, 3) if total else 0.0,
        }

    async def get_or_set(self, key: str, ttl_s: int, factory: Callable[[], Awaitable[Any]]) -> Any:
        """Return cached value or run `factory`, coalescing concurrent misses.

        Concurrent callers that miss on the same key await a single factory run
        rather than each hitting the upstream provider.
        """
        cached = await self.get(key)
        if cached is not None:
            return cached
        async with self._lock:
            entry = self._store.get(key)
            if entry is not None and entry.expires_at > time.monotonic():
                self._store.move_to_end(key)
                self.hits += 1
                return entry.value
            value = await factory()
            if ttl_s > 0:
                self._store[key] = _Entry(value, time.monotonic() + ttl_s)
                self._store.move_to_end(key)
                while len(self._store) > self._max_entries:
                    self._store.popitem(last=False)
            self.misses += 1
            return value


def coord_key(lat: float, lon: float, precision: int = 2) -> str:
    """Bucket coordinates so nearby requests share a cache entry.

    Two decimals is ~1.1 km, which is well inside the spatial resolution of both
    Open-Meteo and the station-level AQI models.
    """
    return f"{round(float(lat), precision):.{precision}f},{round(float(lon), precision):.{precision}f}"
