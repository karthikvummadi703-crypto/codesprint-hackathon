from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from services.context.formatters import _by_month, _compass, _num, _relative_label

COMPASS_POINTS = (
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
)
MESSAGE_STRATEGY = st.one_of(
    st.none(),
    st.floats(min_value=-1_000.0, max_value=1_000.0, allow_nan=False, allow_infinity=False),
    st.integers(min_value=-1_000, max_value=1_000),
    st.text(alphabet="abc 12", max_size=12),
)
STATIC_LABELS = ("not-a-time", "2024-99-99", "2000-01-01T00:00:00Z")


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(value=MESSAGE_STRATEGY)
def test_num_formats_none_floats_and_plain_values(value: float | int | str | None) -> None:
    if value is None:
        expected = "unavailable"
    elif isinstance(value, float):
        expected = f"{value:g}"
    else:
        expected = str(value)
    assert _num(value) == expected


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(degrees=st.integers(min_value=-720, max_value=720))
def test_compass_is_periodic_and_returns_known_point(degrees: int) -> None:
    direction = _compass(degrees)
    assert direction in COMPASS_POINTS
    assert _compass(degrees + 360) == direction


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(months=st.lists(st.integers(min_value=1, max_value=12), max_size=20))
def test_by_month_groups_by_prefix_and_preserves_order(months: list[int]) -> None:
    rows = [{"date": f"2024-{month:02d}-15", "order": index} for index, month in enumerate(months)]
    grouped = _by_month(rows)
    assert set(grouped) == {f"2024-{month:02d}" for month in months}
    for prefix, group in grouped.items():
        assert group == [row for row in rows if str(row["date"]).startswith(prefix)]


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(value=st.one_of(st.none(), st.sampled_from(STATIC_LABELS)))
def test_relative_label_handles_missing_past_and_invalid_timestamps(value: str | None) -> None:
    if value is None:
        expected = "later"
    elif value == "2000-01-01T00:00:00Z":
        expected = "now"
    else:
        expected = value
    assert _relative_label(value) == expected


@settings(deadline=None, max_examples=30, derandomize=True, database=None)
@given(hours=st.integers(min_value=1, max_value=23))
def test_relative_label_renders_near_future_as_hours(hours: int) -> None:
    moment = datetime.now(UTC) + timedelta(hours=hours)
    assert _relative_label(moment.isoformat().replace("+00:00", "Z")) == f"in {hours}h"


@settings(deadline=None, max_examples=30, derandomize=True, database=None)
@given(days=st.integers(min_value=1, max_value=10))
def test_relative_label_renders_far_future_as_days(days: int) -> None:
    moment = datetime.now(UTC) + timedelta(days=days)
    assert _relative_label(moment.isoformat().replace("+00:00", "Z")) == f"in {days}d"
