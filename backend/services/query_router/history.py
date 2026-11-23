"""Historical period detection and date-window resolution."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta

_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_DAYS_RE = re.compile(r"\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b")

# Phrases that anchor a question to a past period.
_HISTORY_TERMS = (
    "last year", "previous year", "past year", "years ago", "last 12 months",
    "past 12 months", "this year", "year to date", "ytd",
    "last month", "previous month", "past month",
    "last week", "past week", "this week", "last 7 days", "past 7 days",
    "yesterday", "historical", "history", "annual average", "yearly",
)

_MONTH_NUMBERS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}
# "may" is excluded from bare matching because it is overwhelmingly the modal verb
# ("it may rain") rather than the month.
_MAY_RE = re.compile(r"\b(?:in|of|during|since|last|next|this)\s+may\b|\bmay\s+(?:19|20)\d{2}\b")


def _mentions_month(text: str) -> int | None:
    for name, number in _MONTH_NUMBERS.items():
        if re.search(rf"\b{name}\b", text):
            return number
    if _MAY_RE.search(text):
        return 5
    return None


def wants_historical(message: str) -> bool:
    """Whether the question is anchored to a past period worth fetching history for."""
    text = f" {message.lower().strip()} "
    if _YEAR_RE.search(text):
        return True
    if any(term in text for term in _HISTORY_TERMS):
        return True
    if _mentions_month(text):
        return True
    if re.search(r"\b(?:last|this|past|previous)\s+(?:winter|summer|monsoon)\b", text):
        return True
    return bool(_DAYS_RE.search(text))


def history_window(
    message: str, today: date | None = None
) -> tuple[str, str, str] | None:
    """Resolve a past period to (start_date, end_date, human_label).

    Returns None when the message names no recognisable period, so callers can
    skip the provider call rather than guessing at a range.
    """
    today = today or datetime.now(UTC).date()
    text = f" {message.lower().strip()} "

    years = _YEAR_RE.findall(text)
    month = _mentions_month(text)
    # "November 2023" is a month, not the whole year, so a named month wins.
    if month and years:
        return _month_year_window(month, int(years[-1]), today)
    if years:
        return _year_window(int(years[-1]), today)
    if month:
        return _month_window(month, today)

    if any(
        phrase in text
        for phrase in ("last year", "previous year", "past year", "last 12 months", "past 12 months")
    ):
        return _year_window(today.year - 1, today)
    if any(phrase in text for phrase in ("this year", "year to date", "ytd")):
        return (date(today.year, 1, 1).isoformat(), today.isoformat(), f"{today.year} so far")

    if any(phrase in text for phrase in ("last month", "previous month", "past month")):
        last_prev = date(today.year, today.month, 1) - timedelta(days=1)
        start = date(last_prev.year, last_prev.month, 1)
        return (start.isoformat(), last_prev.isoformat(), start.strftime("%B %Y"))

    if any(phrase in text for phrase in ("last week", "past week", "this week", "last 7 days", "past 7 days")):
        return ((today - timedelta(days=6)).isoformat(), today.isoformat(), "the last 7 days")

    if "yesterday" in text:
        day = today - timedelta(days=1)
        return (day.isoformat(), day.isoformat(), "yesterday")

    recent = _recent_days(text)
    if recent:
        return ((today - timedelta(days=recent - 1)).isoformat(), today.isoformat(), f"the last {recent} days")

    return _season_window(text, today)


def _year_window(year: int, today: date) -> tuple[str, str, str]:
    if year >= today.year:
        return (date(today.year, 1, 1).isoformat(), today.isoformat(), f"{today.year} so far")
    return (date(year, 1, 1).isoformat(), date(year, 12, 31).isoformat(), str(year))


def _month_year_window(month: int, year: int, today: date) -> tuple[str, str, str]:
    start = date(year, month, 1)
    if start > today:
        # A future month names no observable data; use the most recent past one.
        return _month_window(month, today)
    end = _last_day(year, month)
    end = min(end, today)
    return (start.isoformat(), end.isoformat(), start.strftime("%B %Y"))


def _month_window(month: int, today: date) -> tuple[str, str, str]:
    year = today.year if month <= today.month else today.year - 1
    start = date(year, month, 1)
    end = _last_day(year, month)
    end = min(end, today)
    return (start.isoformat(), end.isoformat(), start.strftime("%B %Y"))


def _last_day(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1) - timedelta(days=1)


def _recent_days(text: str) -> int | None:
    match = _DAYS_RE.search(text)
    if not match:
        return None
    return max(1, min(int(match.group(1)), 365))


def _season_window(text: str, today: date) -> tuple[str, str, str] | None:
    if re.search(r"\b(?:last|this|past|previous)\s+winter\b", text):
        if today.month <= 2:
            start = date(today.year - 1, 11, 1)
            end = _last_day(today.year, 2)
        else:
            start = date(today.year, 11, 1)
            end = _last_day(today.year + 1, 2)
            if start > today:
                start = date(today.year - 1, 11, 1)
                end = _last_day(today.year, 2)
        end = min(end, today)
        return (start.isoformat(), end.isoformat(), "winter")

    for name, (sm, sd, em, ed) in (("summer", (3, 1, 5, 31)), ("monsoon", (6, 1, 9, 30))):
        if re.search(rf"\b(?:last|this|past|previous)\s+{name}\b", text):
            year = today.year
            start, end = date(year, sm, sd), date(year, em, ed)
            if start > today:
                year -= 1
                start, end = date(year, sm, sd), date(year, em, ed)
            end = min(end, today)
            return (start.isoformat(), end.isoformat(), name)
    return None
