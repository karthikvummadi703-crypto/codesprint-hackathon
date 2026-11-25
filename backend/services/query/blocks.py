"""Context block constants and intent-to-block mapping."""

from __future__ import annotations

# Context blocks the prompt builder can include.
BLOCK_WEATHER_NOW = "weather_now"
BLOCK_WEATHER_FORECAST = "weather_forecast"
BLOCK_AQI_NOW = "aqi_now"
BLOCK_AQI_FORECAST = "aqi_forecast"
BLOCK_AQI_HISTORY = "aqi_history"
BLOCK_CARBON = "carbon"
BLOCK_DOCUMENTS = "documents"
BLOCK_LOCATION = "location"
BLOCK_VULNERABILITY = "vulnerability"
BLOCK_ACTIVITY = "activity_guidance"
BLOCK_CAUSE = "cause_context"

_ALL_ENVIRONMENTAL = (
    BLOCK_LOCATION,
    BLOCK_AQI_NOW,
    BLOCK_AQI_FORECAST,
    BLOCK_AQI_HISTORY,
    BLOCK_VULNERABILITY,
)

# What each intent actually needs in the prompt.
_BLOCKS: dict[str, tuple[str, ...]] = {
    "greeting": (BLOCK_LOCATION,),
    "weather": (BLOCK_LOCATION, BLOCK_WEATHER_NOW, BLOCK_WEATHER_FORECAST),
    "rain": (BLOCK_LOCATION, BLOCK_WEATHER_NOW, BLOCK_WEATHER_FORECAST),
    "air_quality": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_AQI_FORECAST),
    "forecast": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_AQI_FORECAST, BLOCK_WEATHER_FORECAST),
    "safety": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_WEATHER_NOW, BLOCK_VULNERABILITY, BLOCK_ACTIVITY),
    "cause": (BLOCK_LOCATION, BLOCK_AQI_NOW, BLOCK_WEATHER_NOW, BLOCK_CAUSE),
    "comparison": (BLOCK_LOCATION, BLOCK_AQI_HISTORY, BLOCK_WEATHER_FORECAST),
    "historical": (BLOCK_LOCATION, BLOCK_AQI_HISTORY, BLOCK_AQI_NOW),
    "carbon": (BLOCK_LOCATION, BLOCK_CARBON),
    "documents": (BLOCK_DOCUMENTS,),
    "general": _ALL_ENVIRONMENTAL,
}


def blocks_for(intent: str) -> tuple[str, ...]:
    if intent == "combined":
        return (
            BLOCK_LOCATION,
            BLOCK_AQI_NOW,
            BLOCK_WEATHER_NOW,
            BLOCK_WEATHER_FORECAST,
            BLOCK_VULNERABILITY,
        )
    if intent == "document_context":
        # Retrieved excerpts *and* live readings, so "compare the report with
        # current conditions" can actually be answered.
        return (
            BLOCK_LOCATION,
            BLOCK_DOCUMENTS,
            BLOCK_AQI_NOW,
            BLOCK_WEATHER_NOW,
            BLOCK_WEATHER_FORECAST,
            BLOCK_VULNERABILITY,
        )
    return _BLOCKS.get(intent, _BLOCKS["general"])


def wants_documents(intent: str) -> bool:
    return BLOCK_DOCUMENTS in blocks_for(intent)


def wants_location(intent: str) -> bool:
    return BLOCK_LOCATION in blocks_for(intent)
