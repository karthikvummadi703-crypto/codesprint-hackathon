"""Hypothesis properties for the pure math and in-memory counter/cache paths.

Module mapping (the requested ``aqi/math.py`` / ``breakpoints.py`` do not exist):

* AQI breakpoints and math -> ``services/air_quality_service.py``
  (``PM25_BREAKS``/..., ``_sub_index``, ``compute_aqi``, ``aqi_category``).
* Carbon calculations -> ``services/carbon_service.py``.
* TTL cache -> ``cache.py``; rate-limit counter -> ``middleware.py``.

No provider is contacted and no real clock is read: time-bearing modules receive
a local fake-clock object, and async production calls are driven with
``asyncio.run`` on explicitly supplied inputs.
"""

from __future__ import annotations

import asyncio
import math
from contextlib import contextmanager
from dataclasses import dataclass
from types import SimpleNamespace

import cache
import middleware
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from services import air_quality_service as aq
from services import carbon_service as carbon

_BREAK_TABLES = (
    aq.PM25_BREAKS,
    aq.PM10_BREAKS,
    aq.NO2_BREAKS,
    aq.SO2_BREAKS,
    aq.CO_BREAKS,
    aq.O3_BREAKS,
)

_CONCENTRATION = st.floats(
    min_value=0.0, max_value=1_000.0, allow_nan=False, allow_infinity=False, width=32
)
_UNIT_INTERVAL = st.floats(
    min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False, width=32
)
_LATITUDE = st.floats(
    min_value=-80.0, max_value=80.0, allow_nan=False, allow_infinity=False, width=32
)
_LONGITUDE = st.floats(
    min_value=-170.0, max_value=170.0, allow_nan=False, allow_infinity=False, width=32
)


@dataclass(frozen=True)
class _BreakSample:
    breaks: tuple[tuple[float, int], ...]
    value: float


@dataclass(frozen=True)
class _Components:
    pm25: float
    pm10: float
    o3: float
    no2: float
    so2: float
    co: float


_BREAK_SAMPLE = st.sampled_from(_BREAK_TABLES).flatmap(
    lambda table: st.builds(
        _BreakSample,
        breaks=st.just(tuple(table)),
        value=st.floats(
            min_value=0.0,
            max_value=float(table[-1][0]) - 1.0,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
)
_COMPONENTS = st.builds(
    _Components,
    pm25=_CONCENTRATION,
    pm10=_CONCENTRATION,
    o3=_CONCENTRATION,
    no2=_CONCENTRATION,
    so2=_CONCENTRATION,
    co=_CONCENTRATION,
)

st.register_type_strategy(_BreakSample, _BREAK_SAMPLE)
st.register_type_strategy(_Components, _COMPONENTS)


class _Clock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@contextmanager
def _frozen_clock(module, *, with_perf_counter=False):
    fake = _Clock()
    attributes = {"monotonic": fake}
    if with_perf_counter:
        attributes["perf_counter"] = fake
    original = module.time
    module.time = SimpleNamespace(**attributes)
    try:
        yield fake
    finally:
        module.time = original


def _payload(components: _Components) -> dict:
    return {
        "pm2_5": components.pm25,
        "pm10": components.pm10,
        "o3": components.o3,
        "no2": components.no2,
        "so2": components.so2,
        "co": components.co,
    }


# ---------------------------------------------------------------------------
# AQI breakpoints and math
# ---------------------------------------------------------------------------


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(index=st.integers(min_value=0, max_value=6))
def test_breakpoints_map_exactly_to_published_aqi(index):
    for table in _BREAK_TABLES:
        concentration, expected = table[index]
        assert aq._sub_index(concentration, list(table)) == expected


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(sample=st.from_type(_BreakSample))
def test_sub_index_is_monotonic_inside_each_table(sample):
    breaks = list(sample.breaks)
    assert aq._sub_index(sample.value + 1.0, breaks) >= aq._sub_index(
        sample.value, breaks
    )


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    table=st.sampled_from(_BREAK_TABLES),
    segment=st.integers(min_value=0, max_value=5),
    fraction=_UNIT_INTERVAL,
)
def test_sub_index_interpolates_linearly(table, segment, fraction):
    breaks = list(table)
    c_low, i_low = (0.0, 0) if segment == 0 else breaks[segment - 1]
    c_high, i_high = breaks[segment]
    value = c_low + fraction * (c_high - c_low)
    expected = i_low + fraction * (i_high - i_low)
    assert aq._sub_index(value, breaks) == pytest.approx(expected, abs=1)


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(aqi_value=st.integers(min_value=-20, max_value=700))
def test_aqi_category_partition(aqi_value):
    if aqi_value <= 50:
        expected = "Good"
    elif aqi_value <= 100:
        expected = "Moderate"
    elif aqi_value <= 150:
        expected = "Unhealthy for Sensitive Groups"
    elif aqi_value <= 200:
        expected = "Unhealthy"
    elif aqi_value <= 300:
        expected = "Very Unhealthy"
    else:
        expected = "Hazardous"
    assert aq.aqi_category(aqi_value) == expected


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(components=st.from_type(_Components))
def test_compute_aqi_uses_independent_unit_conversions(components):
    divisors = {
        "pm25": 1.0,
        "pm10": 1.0,
        "o3": 1.96,
        "no2": 1.88,
        "so2": 2.62,
        "co": 1_150.0,
    }
    tables = {
        "pm25": aq.PM25_BREAKS,
        "pm10": aq.PM10_BREAKS,
        "o3": aq.O3_BREAKS,
        "no2": aq.NO2_BREAKS,
        "so2": aq.SO2_BREAKS,
        "co": aq.CO_BREAKS,
    }
    values = {
        "pm25": components.pm25,
        "pm10": components.pm10,
        "o3": components.o3,
        "no2": components.no2,
        "so2": components.so2,
        "co": components.co,
    }
    sub = aq.compute_aqi(_payload(components))["sub"]
    for key, value in values.items():
        assert sub[key] == aq._sub_index(value / divisors[key], list(tables[key]))


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(components=st.from_type(_Components))
def test_compute_aqi_aggregation_invariants(components):
    result = aq.compute_aqi(_payload(components))
    assert set(result["sub"]) == {"pm25", "pm10", "o3", "no2", "so2", "co"}
    assert all(isinstance(value, int) for value in result["sub"].values())
    assert result["aqi"] == max(result["sub"].values())
    winners = [key for key, value in result["sub"].items() if value == result["aqi"]]
    assert result["dominant"] in winners


def test_current_extrapolation_drops_right_after_last_breakpoint():
    last = aq.PM25_BREAKS[-1][0]
    assert aq._sub_index(last, aq.PM25_BREAKS) == 500
    assert aq._sub_index(last + 0.01, aq.PM25_BREAKS) < 500


# ---------------------------------------------------------------------------
# Carbon calculations
# ---------------------------------------------------------------------------


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(lat1=_LATITUDE, lon1=_LONGITUDE, lat2=_LATITUDE, lon2=_LONGITUDE)
def test_haversine_is_symmetric_bounded_and_zero_for_same_point(lat1, lon1, lat2, lon2):
    distance = carbon.haversine_km(lat1, lon1, lat2, lon2)
    assert distance == pytest.approx(
        carbon.haversine_km(lat2, lon1, lat1, lon2), abs=1e-6
    )
    assert 0.0 <= distance <= math.pi * carbon.EARTH_RADIUS_KM + 1e-6
    assert carbon.haversine_km(lat1, lon1, lat1, lon1) == pytest.approx(0.0, abs=1e-9)


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    distance=st.floats(
        min_value=0.01, max_value=20_000.0, allow_nan=False, allow_infinity=False
    ),
    mode=st.sampled_from(sorted(carbon.CO2_FACTORS_KG_PER_KM)),
)
def test_carbon_calculation_for_known_modes(distance, mode):
    result = asyncio.run(carbon.calculate_carbon("A", "B", distance, mode))
    car = round(distance * carbon.CO2_FACTORS_KG_PER_KM["Car"], 2)
    assert result["estimated"] is False
    assert result["mode"] == mode
    assert result["distanceKm"] == distance
    assert result["co2eKg"] == round(distance * carbon.CO2_FACTORS_KG_PER_KM[mode], 2)
    assert result["savings"] == round(max(0.0, car - result["co2eKg"]), 2)
    assert result["savings"] >= 0.0


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    distance=st.floats(
        min_value=20_000.01, max_value=1e7, allow_nan=False, allow_infinity=False
    )
)
def test_carbon_distance_is_capped(distance):
    result = asyncio.run(carbon.calculate_carbon("A", "B", distance, "Car"))
    assert result["distanceKm"] == carbon.MAX_DISTANCE_KM
    assert result["co2eKg"] == round(
        carbon.MAX_DISTANCE_KM * carbon.CO2_FACTORS_KG_PER_KM["Car"], 2
    )


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    mode=st.text(alphabet="xyz ", min_size=1, max_size=8),
    distance=st.floats(
        min_value=1.0, max_value=1_000.0, allow_nan=False, allow_infinity=False
    ),
)
def test_unknown_mode_falls_back_to_car(mode, distance):
    result = asyncio.run(carbon.calculate_carbon("A", "B", distance, mode))
    assert result["mode"] == "Car"
    assert result["co2eKg"] == round(distance * carbon.CO2_FACTORS_KG_PER_KM["Car"], 2)


# ---------------------------------------------------------------------------
# TTLCache
# ---------------------------------------------------------------------------


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(ttl=st.integers(min_value=1, max_value=60), value=st.integers(-1_000, 1_000))
def test_cache_expiry_is_exclusive(ttl, value):
    with _frozen_clock(cache) as clock:

        async def scenario():
            store = cache.TTLCache(max_entries=4)
            await store.set("k", value, ttl)
            clock.advance(ttl - 1)
            assert await store.get("k") == value
            clock.advance(1)
            assert await store.get("k") is None
            stats = store.stats()
            assert stats["entries"] == 0
            assert stats["hits"] == 1
            assert stats["misses"] == 1

        asyncio.run(scenario())


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(ttl=st.integers(min_value=-5, max_value=0))
def test_cache_nonpositive_ttl_is_a_no_op(ttl):
    with _frozen_clock(cache):

        async def scenario():
            store = cache.TTLCache(max_entries=4)
            await store.set("k", "v", ttl)
            assert await store.get("k") is None
            assert store.stats()["entries"] == 0
            assert store.stats()["misses"] == 1

        asyncio.run(scenario())


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    max_entries=st.integers(min_value=1, max_value=8),
    extra=st.integers(min_value=0, max_value=10),
)
def test_cache_evicts_oldest_entries(max_entries, extra):
    with _frozen_clock(cache):

        async def scenario():
            store = cache.TTLCache(max_entries=max_entries)
            total = max_entries + extra
            for index in range(total):
                await store.set(f"k{index}", index, 60)
            assert store.stats()["entries"] == max_entries
            for index in range(total):
                expected = index if index >= extra else None
                assert await store.get(f"k{index}") == expected

        asyncio.run(scenario())


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(callers=st.integers(min_value=1, max_value=12))
def test_cache_coalesces_concurrent_misses(callers):
    with _frozen_clock(cache):

        async def scenario():
            store = cache.TTLCache(max_entries=8)
            calls = 0

            async def factory():
                nonlocal calls
                calls += 1
                await asyncio.sleep(0)
                return calls

            results = await asyncio.gather(
                *(store.get_or_set("k", 60, factory) for _ in range(callers))
            )
            assert results == [1] * callers
            assert calls == 1
            assert store.stats()["entries"] == 1

        asyncio.run(scenario())


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    keys=st.lists(
        st.text(alphabet="ab", min_size=1, max_size=4),
        min_size=0,
        max_size=8,
        unique=True,
    ),
    prefix=st.text(alphabet="ab", min_size=1, max_size=2),
)
def test_cache_prefix_invalidation_matches_startswith(keys, prefix):
    with _frozen_clock(cache):

        async def scenario():
            store = cache.TTLCache(max_entries=32)
            for key in keys:
                await store.set(key, key, 60)
            doomed = [key for key in keys if key.startswith(prefix)]
            assert await store.invalidate_prefix(prefix) == len(doomed)
            assert store.stats()["entries"] == len(keys) - len(doomed)
            for key in keys:
                expected = None if key in doomed else key
                assert await store.get(key) == expected

        asyncio.run(scenario())


# ---------------------------------------------------------------------------
# Rate-limit counter
# ---------------------------------------------------------------------------


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    limit=st.integers(min_value=1, max_value=6),
    calls=st.integers(min_value=1, max_value=12),
    window=st.integers(min_value=2, max_value=30),
)
def test_counter_budget_and_retry_after(limit, calls, window):
    with _frozen_clock(middleware, with_perf_counter=True):
        counter = middleware._FixedWindowCounter()
        outcomes = [counter.hit("k", limit, window) for _ in range(calls)]
        assert [allowed for allowed, _ in outcomes] == [True] * min(calls, limit) + [
            False
        ] * max(0, calls - limit)
        for allowed, retry_after in outcomes[limit:]:
            assert allowed is False
            assert 1 <= retry_after <= window + 1


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    limit=st.integers(min_value=1, max_value=5),
    window=st.integers(min_value=2, max_value=30),
)
def test_counter_reopens_at_window_boundary(limit, window):
    with _frozen_clock(middleware, with_perf_counter=True) as limiter_clock:
        counter = middleware._FixedWindowCounter()
        for _ in range(limit):
            assert counter.hit("k", limit, window)[0] is True
        limiter_clock.advance(window - 1)
        assert counter.hit("k", limit, window)[0] is False
        limiter_clock.advance(1)
        assert counter.hit("k", limit, window)[0] is True


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    keys=st.lists(
        st.text(alphabet="ab", min_size=1, max_size=3),
        min_size=1,
        max_size=6,
        unique=True,
    ),
    limit=st.integers(min_value=1, max_value=4),
)
def test_counter_budgets_are_per_key_and_resettable(keys, limit):
    with _frozen_clock(middleware, with_perf_counter=True):
        counter = middleware._FixedWindowCounter()
        for key in keys:
            assert all(counter.hit(key, limit, 60)[0] for _ in range(limit))
            assert counter.hit(key, limit, 60)[0] is False
        counter.reset()
        for key in keys:
            assert counter.hit(key, limit, 60)[0] is True


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(limit=st.integers(min_value=-3, max_value=0))
def test_nonpositive_limit_currently_raises_index_error(limit):
    with _frozen_clock(middleware, with_perf_counter=True):
        counter = middleware._FixedWindowCounter()
        with pytest.raises(IndexError):
            counter.hit("k", limit, 60)
