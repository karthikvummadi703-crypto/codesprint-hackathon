from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from schemas import CarbonRequest, ChatRequest, ChatTurnIn, CoordinatesQuery

TEXT_PARTS = ("a", "b", " ", "\n", "\t", "\x00", "\r", "\x1b")
PLACE_PARTS = ("a", "b", " ", "\t")


def _clean_text(value: str) -> str:
    return "".join(ch for ch in value if ch == "\n" or ch == "\t" or ch.isprintable()).strip()


def _has_printable_content(value: str) -> bool:
    return bool(_clean_text(value))


def _has_nonspace_content(value: str) -> bool:
    return bool(value.strip())


MESSAGE_STRATEGY = (
    st.lists(st.sampled_from(TEXT_PARTS), min_size=1, max_size=40).map("".join).filter(_has_printable_content)
)
PLACE_STRATEGY = (
    st.lists(st.sampled_from(PLACE_PARTS), min_size=1, max_size=24).map("".join).filter(_has_nonspace_content)
)


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(message=MESSAGE_STRATEGY)
def test_chat_request_removes_control_characters(message: str) -> None:
    request = ChatRequest(message=message)
    assert request.message == _clean_text(message)
    assert "\x00" not in request.message
    assert "\r" not in request.message


@settings(deadline=None, max_examples=50, derandomize=True, database=None)
@given(content=MESSAGE_STRATEGY)
def test_chat_turn_strips_control_characters(content: str) -> None:
    turn = ChatTurnIn(role="user", content=content)
    assert turn.content == _clean_text(content)


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(ids=st.lists(st.text(alphabet="ab \t\n", max_size=12), max_size=5))
def test_chat_request_discards_blank_document_ids(ids: list[str]) -> None:
    request = ChatRequest(message="hello", documentIds=ids)
    expected = [item.strip() for item in ids if item.strip()]
    assert request.documentIds == (expected or None)


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(origin=PLACE_STRATEGY, destination=PLACE_STRATEGY)
def test_carbon_request_trims_place_names(origin: str, destination: str) -> None:
    request = CarbonRequest(origin=origin, destination=destination)
    assert request.origin == origin.strip()
    assert request.destination == destination.strip()


@settings(deadline=None, max_examples=40, derandomize=True, database=None)
@given(
    lat=st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False),
    lon=st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False),
)
def test_coordinates_query_accepts_in_range_values(lat: float, lon: float) -> None:
    query = CoordinatesQuery(lat=lat, lon=lon)
    assert query.lat == lat
    assert query.lon == lon


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(
    lat=st.floats(min_value=90.000001, max_value=1_000.0, allow_nan=False, allow_infinity=False),
    lon=st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False),
)
def test_coordinates_query_rejects_latitude_above_range(lat: float, lon: float) -> None:
    with pytest.raises(ValidationError):
        CoordinatesQuery(lat=lat, lon=lon)


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(
    lat=st.floats(min_value=-1_000.0, max_value=-90.000001, allow_nan=False, allow_infinity=False),
    lon=st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False),
)
def test_coordinates_query_rejects_latitude_below_range(lat: float, lon: float) -> None:
    with pytest.raises(ValidationError):
        CoordinatesQuery(lat=lat, lon=lon)


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(
    lat=st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False),
    lon=st.floats(min_value=180.000001, max_value=2_000.0, allow_nan=False, allow_infinity=False),
)
def test_coordinates_query_rejects_longitude_above_range(lat: float, lon: float) -> None:
    with pytest.raises(ValidationError):
        CoordinatesQuery(lat=lat, lon=lon)


@settings(deadline=None, max_examples=20, derandomize=True, database=None)
@given(
    lat=st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False),
    lon=st.floats(min_value=-2_000.0, max_value=-180.000001, allow_nan=False, allow_infinity=False),
)
def test_coordinates_query_rejects_longitude_below_range(lat: float, lon: float) -> None:
    with pytest.raises(ValidationError):
        CoordinatesQuery(lat=lat, lon=lon)
