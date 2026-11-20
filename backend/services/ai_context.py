"""Builds the structured, intent-scoped context block sent to the LLM.

Design rules:

* Only the blocks the router asked for are assembled, so a rainfall question does
  not ship the whole pollution dataset.
* Every block declares its own data provenance — measured, forecast or modelled —
  so the model can be told never to present one as another.
* Missing data is stated explicitly rather than omitted, so the assistant can say
  "I don't have that" instead of inventing a value.
"""

from __future__ import annotations

from services.context.builder import ContextBuilder as ContextBuilder
from services.context.formatters import (
    _FORECAST as _FORECAST,
)
from services.context.formatters import (
    _MEASURED as _MEASURED,
)
from services.context.formatters import (
    _MODELLED as _MODELLED,
)
from services.context.formatters import (
    _by_month as _by_month,
)
from services.context.formatters import (
    _compass as _compass,
)
from services.context.formatters import (
    _num as _num,
)
from services.context.formatters import (
    _relative_label as _relative_label,
)
from services.context.formatters import (
    context_timestamp as context_timestamp,
)

__all__ = [
    "ContextBuilder",
    "context_timestamp",
    "_FORECAST",
    "_MEASURED",
    "_MODELLED",
    "_by_month",
    "_compass",
    "_num",
    "_relative_label",
]
