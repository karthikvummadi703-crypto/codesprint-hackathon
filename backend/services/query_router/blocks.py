"""Context-block definitions for the environmental assistant."""

from __future__ import annotations

from dataclasses import dataclass, field

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


@dataclass(frozen=True)
class Intent:
    name: str
    blocks: tuple[str, ...] = field(default_factory=tuple)


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
