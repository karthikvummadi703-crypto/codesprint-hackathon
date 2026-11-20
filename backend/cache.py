"""In-process TTL cache used for provider responses.

Keyed by request shape (e.g. rounded coordinates + provider), never by user
identity, so a cache hit is always safe to share between users. Entries expire
after a configurable TTL and the store is bounded to avoid unbounded growth.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from logging_config import get_logger

log = get_logger("airguard.cache")


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TTLCache:
    def __init__(self, max_entries: int = 512) -> None:
        self._max_entries = max(1, max_entries)
        self._store: OrderedDict[str, _Entry] = OrderedDict()
        self._inflight: dict[str, asyncio.Task[Any]] = {}
        self._lock = asyncio.Lock()
        self._generation = 0
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
            self._generation += 1
            if doomed:
                log.info("cache invalidated prefix=%s entries=%d", prefix, len(doomed))
            return len(doomed)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()
            self._generation += 1

    def stats(self) -> dict:
        total = self.hits + self.misses
        return {
            "entries": len(self._store),
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": round(self.hits / total, 3) if total else 0.0,
        }

    async def _run_factory(
        self, key: str, ttl_s: int, factory: Callable[[], Awaitable[Any]], generation: int
    ) -> Any:
        value = await factory()
        if ttl_s <= 0:
            return value
        async with self._lock:
            if generation != self._generation:
                return value
            self._store[key] = _Entry(value, time.monotonic() + ttl_s)
            self._store.move_to_end(key)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)
        return value

    async def get_or_set(self, key: str, ttl_s: int, factory: Callable[[], Awaitable[Any]]) -> Any:
        """Return cached value or run `factory`, coalescing concurrent misses.

        Concurrent callers that miss on the same key await a single factory run
        rather than each hitting the upstream provider. Different keys remain
        independent, so one slow provider never blocks another cache entry.
        """
        cached = await self.get(key)
        if cached is not None:
            return cached
        async with self._lock:
            task = self._inflight.get(key)
            if task is None:
                task = asyncio.create_task(self._run_factory(key, ttl_s, factory, self._generation))
                self._inflight[key] = task
                owner = True
            else:
                owner = False
        try:
            return await asyncio.shield(task)
        finally:
            if owner:
                async with self._lock:
                    if self._inflight.get(key) is task:
                        self._inflight.pop(key, None)


def coord_key(lat: float, lon: float, precision: int = 2) -> str:
    """Bucket coordinates so nearby requests share a cache entry.

    Two decimals is ~1.1 km, which is well inside the spatial resolution of both
    Open-Meteo and the station-level AQI models.
    """
    return f"{round(float(lat), precision):.{precision}f},{round(float(lon), precision):.{precision}f}"
