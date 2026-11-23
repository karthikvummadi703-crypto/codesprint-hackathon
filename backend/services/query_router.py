"""Query classification for the environmental assistant.

Deterministic, keyword-based routing so that a question about tomorrow's rainfall
never pays for AQI history and a document question never pays for a weather call.
Each intent declares which context blocks are worth fetching, which is what keeps
prompt size proportional to the question.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from services.query_router.blocks import (
    _ALL_ENVIRONMENTAL,
    _BLOCKS,
    BLOCK_ACTIVITY,
    BLOCK_AQI_FORECAST,
    BLOCK_AQI_HISTORY,
    BLOCK_AQI_NOW,
    BLOCK_CARBON,
    BLOCK_CAUSE,
    BLOCK_DOCUMENTS,
    BLOCK_LOCATION,
    BLOCK_VULNERABILITY,
    BLOCK_WEATHER_FORECAST,
    BLOCK_WEATHER_NOW,
    Intent,
)
from services.query_router.documents import (
    _DOC_TERMS,
    _ENV_TERMS,
    _SUMMARY_TERMS,
    is_summary_request,
    mentions_documents,
)
from services.query_router.history import (
    _DAYS_RE,
    _HISTORY_TERMS,
    _MAY_RE,
    _MONTH_NUMBERS,
    _YEAR_RE,
    _last_day,
    _mentions_month,
    _month_window,
    _month_year_window,
    _recent_days,
    _season_window,
    _year_window,
    history_window,
    wants_historical,
)
from services.query_router.routing import (
    _COMBINED_TRIGGERS,
    _RULES,
    blocks_for,
    classify,
    wants_documents,
    wants_location,
)

__all__ = [
    "BLOCK_ACTIVITY",
    "BLOCK_AQI_FORECAST",
    "BLOCK_AQI_HISTORY",
    "BLOCK_AQI_NOW",
    "BLOCK_CARBON",
    "BLOCK_CAUSE",
    "BLOCK_DOCUMENTS",
    "BLOCK_LOCATION",
    "BLOCK_VULNERABILITY",
    "BLOCK_WEATHER_FORECAST",
    "BLOCK_WEATHER_NOW",
    "_ALL_ENVIRONMENTAL",
    "_BLOCKS",
    "_COMBINED_TRIGGERS",
    "_DAYS_RE",
    "_DOC_TERMS",
    "_ENV_TERMS",
    "_HISTORY_TERMS",
    "_MAY_RE",
    "_MONTH_NUMBERS",
    "_RULES",
    "_SUMMARY_TERMS",
    "_YEAR_RE",
    "Intent",
    "_last_day",
    "_mentions_month",
    "_month_window",
    "_month_year_window",
    "_recent_days",
    "_season_window",
    "_year_window",
    "blocks_for",
    "classify",
    "dataclass",
    "date",
    "datetime",
    "field",
    "history_window",
    "is_summary_request",
    "mentions_documents",
    "re",
    "timedelta",
    "timezone",
    "wants_documents",
    "wants_historical",
    "wants_location",
]
