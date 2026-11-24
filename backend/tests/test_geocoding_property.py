from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from services.geocoding_service import _cache_key, _to_float


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    kind=st.text(alphabet="abXY", min_size=1, max_size=8),
    value=st.text(alphabet="abXY \t", max_size=20),
)
def test_cache_key_strips_and_lowercases_only_the_value(kind: str, value: str) -> None:
    assert _cache_key(kind, value) == f"geocode:{kind}:{value.strip().lower()}"


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(value=st.floats(min_value=-1_000.0, max_value=1_000.0, allow_nan=False, allow_infinity=False))
def test_to_float_parses_numeric_text(value: float) -> None:
    assert _to_float(str(value)) == pytest.approx(value)


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(value=st.sampled_from(("", " ", "not-a-number", "nan?")))
def test_to_float_falls_back_to_zero_for_invalid_text(value: str) -> None:
    assert _to_float(value) == 0.0
