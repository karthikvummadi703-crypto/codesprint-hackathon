"""Additional in-process cache branches without live providers."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator

import pytest

import cache as cache_module


class _Clock:
    def __init__(self, values: Iterator[float]) -> None:
        self._values = values

    def monotonic(self) -> float:
        return next(self._values)


async def test_get_set_hit_rate_and_expiry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cache_module, "time", _Clock(iter([0.0, 1.0, 5.0])))
    cache = cache_module.TTLCache()
    await cache.set("k", "value", 3)
    assert await cache.get("k") == "value"
    assert await cache.get("k") is None
    assert cache.stats() == {"entries": 0, "hits": 1, "misses": 1, "hit_rate": 0.5}


async def test_non_positive_ttl_and_bounded_lru_eviction() -> None:
    cache = cache_module.TTLCache(max_entries=2)
    await cache.set("skip", "value", 0)
    assert await cache.get("skip") is None
    await cache.set("a", "a-value", 60)
    await cache.set("b", "b-value", 60)
    assert await cache.get("a") == "a-value"
    await cache.set("c", "c-value", 60)
    assert await cache.get("b") is None
    assert await cache.get("a") == "a-value"
    assert await cache.get("c") == "c-value"
    assert cache.stats()["entries"] == 2


async def test_invalidate_prefix_only_drops_matching_keys() -> None:
    cache = cache_module.TTLCache()
    await cache.set("air:1,2", "air", 60)
    await cache.set("weather:1,2", "weather", 60)
    assert await cache.invalidate_prefix("air:") == 1
    assert await cache.get("air:1,2") is None
    assert await cache.get("weather:1,2") == "weather"


async def test_clear_empties_entries_but_keeps_counters() -> None:
    cache = cache_module.TTLCache()
    await cache.set("k", "value", 60)
    assert await cache.get("k") == "value"
    await cache.clear()
    assert await cache.get("k") is None
    stats = cache.stats()
    assert stats["entries"] == 0
    assert stats["hits"] == 1
    assert stats["misses"] == 1


async def test_invalidation_prevents_an_inflight_factory_from_caching() -> None:
    cache = cache_module.TTLCache()
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def factory() -> str:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return "stale"

    task = asyncio.create_task(cache.get_or_set("air:1,2", 60, factory))
    await started.wait()
    assert await cache.invalidate_prefix("air:") == 0
    release.set()
    assert await task == "stale"
    assert await cache.get("air:1,2") is None
    assert calls == 1


async def test_concurrent_misses_share_one_factory_call() -> None:
    cache = cache_module.TTLCache()
    calls = 0

    async def factory() -> str:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        return "shared"

    first, second = await asyncio.gather(
        cache.get_or_set("k", 60, factory),
        cache.get_or_set("k", 60, factory),
    )
    assert (first, second) == ("shared", "shared")
    assert calls == 1
    assert cache.stats()["hits"] == 0
    assert cache.stats()["misses"] == 2


async def test_non_positive_ttl_runs_the_factory_every_time() -> None:
    cache = cache_module.TTLCache()
    calls = 0

    async def factory() -> int:
        nonlocal calls
        calls += 1
        return calls

    assert await cache.get_or_set("k", 0, factory) == 1
    assert await cache.get_or_set("k", -1, factory) == 2
    assert calls == 2
    assert cache.stats()["entries"] == 0


async def test_different_keys_have_independent_inflight_tasks() -> None:
    cache = cache_module.TTLCache()

    async def air() -> str:
        await asyncio.sleep(0)
        return "air"

    async def weather() -> str:
        await asyncio.sleep(0)
        return "weather"

    air_value, weather_value = await asyncio.gather(
        cache.get_or_set("air", 60, air),
        cache.get_or_set("weather", 60, weather),
    )
    assert (air_value, weather_value) == ("air", "weather")


@pytest.mark.parametrize(
    ("lat", "lon", "precision", "expected"),
    [
        (17.381, 78.489, 2, "17.38,78.49"),
        (17.384, 78.486, 2, "17.38,78.49"),
        (17.38, 78.49, 3, "17.380,78.490"),
    ],
)
def test_coordinate_keys_are_bucketed(lat: float, lon: float, precision: int, expected: str) -> None:
    assert cache_module.coord_key(lat, lon, precision) == expected
