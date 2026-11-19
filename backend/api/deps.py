"""Shared route dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query, Request, status

from cache import TTLCache
from config import get_settings
from errors import AppError
from services.security import get_uid

# One cache per process. Keys are provider-derived and contain no user data, so a
# hit is always safe to serve to any authenticated caller.
env_cache = TTLCache(get_settings().cache_max_entries)

CurrentUid = Annotated[str, Depends(get_uid)]


async def optional_uid(request: Request) -> str | None:
    """Resolve a uid when a token is present, otherwise allow anonymous access.

    Public environmental data routes use this so the app works before sign-in.
    A malformed or forbidden token is still rejected instead of silently becoming
    anonymous, which keeps auth mistakes visible to callers.
    """
    if not request.headers.get("Authorization"):
        return None
    return await get_uid(request)


OptionalUid = Annotated[str | None, Depends(optional_uid)]


def coordinates(
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lon: Annotated[float | None, Query(ge=-180, le=180)] = None,
    city: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
) -> dict:
    """Validate and normalize the location arguments shared by data routes.

    Coordinates must be supplied as a pair. A half-specified pair is a client bug
    rather than a reason to silently fall back to a default location, so it is
    rejected with a clear message.
    """
    if (lat is None) != (lon is None):
        raise AppError("lat and lon must be provided together", status.HTTP_422_UNPROCESSABLE_ENTITY)
    if lat is not None and city:
        # Both present: coordinates win, matching the pinned dashboard location.
        city = None
    if lat is None and not city:
        raise AppError(
            "Provide either lat/lon or a city name", status.HTTP_422_UNPROCESSABLE_ENTITY
        )
    return {"lat": lat, "lon": lon, "city": city}


def request_uid(request: Request) -> str | None:
    return getattr(request.state, "uid", None)
