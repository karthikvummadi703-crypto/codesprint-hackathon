"""Query classification for the environmental assistant.

Deterministic, keyword-based routing so that a question about tomorrow's rainfall
never pays for AQI history and a document question never pays for a weather call.
Each intent declares which context blocks are worth fetching, which is what keeps
prompt size proportional to the question.
"""

from __future__ import annotations

import re as re
from dataclasses import dataclass as dataclass
from dataclasses import field as field
from datetime import UTC as UTC
from datetime import date as date
from datetime import datetime as datetime
from datetime import timedelta as timedelta

from services.query.blocks import (
    _ALL_ENVIRONMENTAL as _ALL_ENVIRONMENTAL,
)
from services.query.blocks import (
    _BLOCKS as _BLOCKS,
)
from services.query.blocks import (
    BLOCK_ACTIVITY as BLOCK_ACTIVITY,
)
from services.query.blocks import (
    BLOCK_AQI_FORECAST as BLOCK_AQI_FORECAST,
)
from services.query.blocks import (
    BLOCK_AQI_HISTORY as BLOCK_AQI_HISTORY,
)
from services.query.blocks import (
    BLOCK_AQI_NOW as BLOCK_AQI_NOW,
)
from services.query.blocks import (
    BLOCK_CARBON as BLOCK_CARBON,
)
from services.query.blocks import (
    BLOCK_CAUSE as BLOCK_CAUSE,
)
from services.query.blocks import (
    BLOCK_DOCUMENTS as BLOCK_DOCUMENTS,
)
from services.query.blocks import (
    BLOCK_LOCATION as BLOCK_LOCATION,
)
from services.query.blocks import (
    BLOCK_VULNERABILITY as BLOCK_VULNERABILITY,
)
from services.query.blocks import (
    BLOCK_WEATHER_FORECAST as BLOCK_WEATHER_FORECAST,
)
from services.query.blocks import (
    BLOCK_WEATHER_NOW as BLOCK_WEATHER_NOW,
)
from services.query.blocks import (
    blocks_for as blocks_for,
)
from services.query.blocks import (
    wants_documents as wants_documents,
)
from services.query.blocks import (
    wants_location as wants_location,
)
from services.query.documents import (
    _DOC_TERMS as _DOC_TERMS,
)
from services.query.documents import (
    _ENV_TERMS as _ENV_TERMS,
)
from services.query.documents import (
    _SUMMARY_TERMS as _SUMMARY_TERMS,
)
from services.query.documents import (
    is_summary_request as is_summary_request,
)
from services.query.documents import (
    mentions_documents as mentions_documents,
)
from services.query.history import (
    _DAYS_RE as _DAYS_RE,
)
from services.query.history import (
    _HISTORY_TERMS as _HISTORY_TERMS,
)
from services.query.history import (
    _MAY_RE as _MAY_RE,
)
from services.query.history import (
    _MONTH_NUMBERS as _MONTH_NUMBERS,
)
from services.query.history import (
    _YEAR_RE as _YEAR_RE,
)
from services.query.history import (
    _last_day as _last_day,
)
from services.query.history import (
    _mentions_month as _mentions_month,
)
from services.query.history import (
    _month_window as _month_window,
)
from services.query.history import (
    _month_year_window as _month_year_window,
)
from services.query.history import (
    _recent_days as _recent_days,
)
from services.query.history import (
    _season_window as _season_window,
)
from services.query.history import (
    _year_window as _year_window,
)
from services.query.history import (
    history_window as history_window,
)
from services.query.history import (
    wants_historical as wants_historical,
)
from services.query.rules import (
    _COMBINED_TRIGGERS as _COMBINED_TRIGGERS,
)
from services.query.rules import (
    _RULES as _RULES,
)
from services.query.rules import (
    Intent as Intent,
)
from services.query.rules import (
    classify as classify,
)
