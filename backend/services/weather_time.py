"""Local-time alignment and UTC conversion for Open-Meteo timestamps."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from logging_config import get_logger

log = get_logger("airguard.weather")


def _hour_slot_index(observation_local: str, hourly_times: list[str]) -> int:
    """Index of the hourly slot that contains the observation.

    `current.time` is published at 15-minute resolution while the hourly series
    is on the hour, so an exact-match lookup fails for three quarters of all
    requests and silently drops UV index, visibility and rain probability from
    "current conditions". The observation is therefore matched to the hourly slot
    it falls inside, and only to a later slot if no earlier one contains it.
    """
    if not observation_local or not hourly_times:
        return -1
    if observation_local in hourly_times:
        return hourly_times.index(observation_local)

    try:
        observed = datetime.fromisoformat(observation_local).replace(minute=0, second=0, microsecond=0)
    except ValueError:
        return -1

    for index, stamp in enumerate(hourly_times):
        try:
            slot = datetime.fromisoformat(stamp)
        except ValueError:
            continue
        if slot == observed:
            return index
        if slot > observed:
            # First slot after the observation: nothing earlier covered it.
            return index
    return -1


def _to_utc_iso(local_naive: str, tz_name: str) -> str:
    """Convert Open-Meteo's location-local timestamp into a UTC ISO string.

    `timezone=auto` makes the API return wall-clock time without an offset, so the
    location's zone is resolved and applied here. The stored value is a real
    instant, which is what every other module expects.

    A zone that cannot be resolved is logged rather than passed over in silence:
    silently keeping the wall-clock time would publish timestamps that are wrong
    by the UTC offset, which is worse than an obviously unconverted value.
    """
    if not local_naive:
        return ""
    try:
        naive = datetime.fromisoformat(local_naive)
    except ValueError:
        return local_naive

    offset = timedelta(0)
    if tz_name and tz_name.upper() != "UTC":
        try:
            from zoneinfo import ZoneInfo

            offset = naive.replace(tzinfo=ZoneInfo(tz_name)).utcoffset() or timedelta(0)
        except Exception as exc:  # noqa: BLE001 - degrade, but say so
            log.warning(
                "cannot resolve timezone %r (%s); timestamps for %s stay wall-clock",
                tz_name,
                type(exc).__name__,
                tz_name,
            )
            offset = timedelta(0)
    return (naive.replace(tzinfo=UTC) - offset).isoformat().replace("+00:00", "Z")
