"""Environmental AI assistant route.

This is where the query router, the context builder and the LLM service meet. The
backend enriches the request with live weather and AQI for the pinned location so
the client does not have to make a second round-trip, and so the model always sees
current numbers even when the page was left open for a while.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from typing import Annotated, Any, TypeVar, cast

from fastapi import APIRouter, Body, Query

from api.deps import CurrentUid, env_cache
from cache import coord_key
from config import get_settings
from http_client import ProviderError
from logging_config import get_logger
from schemas import ChatRequest, ChatResponse
from services import ai_context, ai_service, air_quality_service, query_router, rag_service

log = get_logger("airguard.api.ai")
router = APIRouter(prefix="/api", tags=["ai"])
T = TypeVar("T")


async def _live_enrichment(
    message: str, location: dict, settings: Any, blocks: set[str], enrich: bool
) -> tuple[dict | None, list[dict] | None, dict | None, list[dict] | None, str | None]:
    """Fetch live AQI/weather and any requested observed history."""
    live_aqi: dict | None = None
    aqi_forecast: list[dict] | None = None
    live_weather: dict | None = None
    observed_history: list[dict] | None = None
    history_label: str | None = None

    has_coords = location.get("latitude") is not None and location.get("longitude") is not None
    if not enrich or not has_coords:
        return live_aqi, aqi_forecast, live_weather, observed_history, history_label

    need_aqi = query_router.BLOCK_AQI_NOW in blocks or query_router.BLOCK_AQI_FORECAST in blocks
    need_weather = query_router.BLOCK_WEATHER_NOW in blocks or query_router.BLOCK_WEATHER_FORECAST in blocks
    if need_aqi or need_weather:
        results = await asyncio.gather(
            _load_air_quality(location, settings) if need_aqi else _no_air_quality(),
            _load_weather(location, settings) if need_weather else _no_weather(),
        )
        (live_aqi, aqi_forecast), live_weather = results

    if query_router.wants_historical(message):
        window = query_router.history_window(message)
        if window:
            observed_history, history_label = await _load_history(location, settings, window)
    return live_aqi, aqi_forecast, live_weather, observed_history, history_label


def _build_context(
    payload: ChatRequest,
    location: dict,
    blocks: set[str],
    live_aqi: dict | None,
    aqi_forecast: list[dict] | None,
    live_weather: dict | None,
    rag_chunks: list[dict],
    observed_history: list[dict] | None,
    history_label: str | None,
) -> tuple[str, list[str], dict[str, bool]]:
    """Assemble the grounded prompt from the payload and live enrichment."""
    weather_for_context = live_weather or (
        payload.weather if query_router.BLOCK_WEATHER_NOW in blocks else None
    )
    aqi_for_context = live_aqi or (
        payload.aqHistory[0] if payload.aqHistory and query_router.BLOCK_AQI_NOW in blocks else None
    )
    builder = ai_context.ContextBuilder(
        location=location,
        air_quality=aqi_for_context,
        aqi_forecast=aqi_forecast,
        weather=weather_for_context,
        predictions=payload.predictions or [],
        carbon_trips=payload.carbonTrips or [],
        history=payload.aqHistory or [],
        rag_chunks=rag_chunks,
        household=payload.household,
        routines=payload.routines,
        routine_context=payload.routineContext,
        aqi_history=observed_history,
        history_label=history_label,
    )
    return builder.build(payload.message)


def _log_llm_usage(result: dict, latency_ms: int) -> None:
    if result.get("prompt_tokens") or result.get("completion_tokens"):
        log.info(
            "llm tokens prompt=%s completion=%s latency=%dms",
            result.get("prompt_tokens"),
            result.get("completion_tokens"),
            latency_ms,
        )


def _log_chat(
    intent: str, sections: list[str], rag_chunks: list[dict], latency_ms: int, result: dict
) -> None:
    log.info(
        "chat intent=%s sections=%d rag_chunks=%d latency=%dms degraded=%s",
        intent,
        len(sections),
        len(rag_chunks),
        latency_ms,
        result.get("degraded"),
    )


@router.post("/ai/chat", response_model=ChatResponse)
async def chat(
    uid: CurrentUid,
    payload: Annotated[ChatRequest, Body()],
    enrich: Annotated[bool, Query(description="Fetch live weather/AQI for the pinned location")] = True,
) -> ChatResponse:
    """Answer an environmental question about the user's selected location."""
    started = time.perf_counter()
    settings = get_settings()

    location = _clean_location(payload.location)
    intent = query_router.classify(payload.message)
    blocks = set(query_router.blocks_for(intent))

    (
        live_aqi,
        aqi_forecast,
        live_weather,
        observed_history,
        history_label,
    ) = await _live_enrichment(payload.message, location, settings, blocks, enrich)

    rag_chunks: list[dict] = []
    if _needs_documents(payload.message, payload.documentIds, intent):
        rag_chunks = await _retrieve_documents(uid, payload.message, payload.documentIds)

    context_text, sections, coverage = _build_context(
        payload,
        location,
        blocks,
        live_aqi,
        aqi_forecast,
        live_weather,
        rag_chunks,
        observed_history,
        history_label,
    )

    result = await ai_service.generate_response(
        payload.message,
        context_text,
        history=[turn.model_dump() for turn in (payload.history or [])],
    )
    latency_ms = int((time.perf_counter() - started) * 1000)
    _log_llm_usage(result, latency_ms)
    _log_chat(intent, sections, rag_chunks, latency_ms, result)

    return ChatResponse(
        response=result["response"],
        contextUsed=bool(rag_chunks),
        intent=intent,
        contextSections=sections,
        provider=result.get("provider", "unknown"),
        latencyMs=latency_ms,
        degraded=bool(result.get("degraded")),
        dataCoverage=coverage,
    )


def _needs_documents(message: str, document_ids: list[str] | None, intent: str) -> bool:
    """Whether this turn should read the knowledge base.

    Three triggers, in order of strength:
      * the user attached a document to this turn, which is an explicit request
        to use it even when the wording does not mention documents;
      * the question is about a document as a whole ("summarise this");
      * the router classified the question as document-based.
    """
    if document_ids:
        return True
    return query_router.wants_documents(intent) or query_router.is_summary_request(message)


async def _retrieve_documents(uid: str, message: str, document_ids: list[str] | None) -> list[dict]:
    """Pull relevant excerpts for the caller's own documents.

    Retrieval never leaves the caller's uid namespace, so a `documentIds` value
    belonging to somebody else simply matches nothing.
    """
    if query_router.is_summary_request(message):
        # A whole-document question shares no vocabulary with the report, so
        # relevance ranking would return nothing; send representative excerpts.
        return await _run_blocking(rag_service.overview, uid, document_ids, 4)
    return await _run_blocking(rag_service.retrieve, uid, message, 4, document_ids)


def _clean_location(raw: dict | None) -> dict:
    if not raw:
        return {}
    cleaned: dict = {}
    name = raw.get("name")
    if isinstance(name, str) and name.strip():
        cleaned["name"] = name.strip()[:200]
    for field in ("latitude", "longitude"):
        value = raw.get(field)
        if isinstance(value, (int, float)) and -180 <= value <= 180:
            cleaned[field] = float(value)
    for field in ("region", "country"):
        value = raw.get(field)
        if isinstance(value, str) and value.strip():
            cleaned[field] = value.strip()[:120]
    if "latitude" in cleaned and "longitude" not in cleaned:
        cleaned.pop("latitude")
    if "longitude" in cleaned and "latitude" not in cleaned:
        cleaned.pop("longitude")
    return cleaned


async def _no_air_quality() -> tuple[None, None]:
    return None, None


async def _no_weather() -> None:
    return None


async def _load_air_quality(location: dict[str, Any], settings: Any) -> tuple[dict | None, list[dict] | None]:
    lat, lon = location["latitude"], location["longitude"]
    aqi_key = f"aqi:{coord_key(lat, lon)}"
    # Namespaced away from `/api/predictions`, which caches a response object under
    # what would otherwise be this same key and a different shape.
    forecast_key = f"ai-aqi-forecast:{coord_key(lat, lon)}:5"

    async def _aqi() -> dict:
        return await air_quality_service.get_air_quality(lat=lat, lon=lon)

    async def _forecast() -> list[dict]:
        return await air_quality_service.fetch_aqi_forecast(lat, lon, days=5) or []

    aqi, forecast = await asyncio.gather(
        env_cache.get_or_set(aqi_key, settings.cache_ttl_aqi_s, _aqi),
        env_cache.get_or_set(forecast_key, settings.cache_ttl_aqi_s, _forecast),
    )
    return cast(dict | None, aqi), cast(list[dict] | None, forecast or None)


async def _load_history(
    location: dict[str, Any], settings: Any, window: tuple[str, str, str]
) -> tuple[list[dict] | None, str | None]:
    """Fetch observed daily history for a past window, cached for a day.

    Reanalysis data for a past period never changes, so it is cached far longer
    than a live reading and shared across users for the same coordinate bucket.
    """
    start, end, label = window
    key = f"ai-aqi-history:{coord_key(location['latitude'], location['longitude'])}:{start}:{end}"

    async def _load() -> list[dict]:
        return (
            await air_quality_service.fetch_aqi_history(
                location["latitude"], location["longitude"], start, end
            )
            or []
        )

    try:
        rows = await env_cache.get_or_set(key, settings.cache_ttl_geocode_s, _load)
    except ProviderError as exc:
        # A history outage must not break the assistant; the builder states the
        # range is unavailable instead.
        log.warning("historical AQI enrichment failed: %s", exc)
        return None, label
    return cast(list[dict] | None, rows or None), label


async def _load_weather(location: dict[str, Any], settings: Any) -> dict | None:
    from services import weather_service

    # Namespaced away from the weather routes, which cache the same provider call
    # for the same coordinates and add their own `location`/hourly shaping.
    key = f"ai-weather:{coord_key(location['latitude'], location['longitude'])}:3:48"

    async def _load() -> dict:
        return await weather_service.fetch_weather(
            location["latitude"], location["longitude"], forecast_days=3
        )

    try:
        return cast(dict | None, await env_cache.get_or_set(key, settings.cache_ttl_weather_s, _load))
    except ProviderError as exc:
        # A weather outage must not break the assistant; the context builder will
        # state that conditions are unavailable instead.
        log.warning("weather enrichment failed: %s", exc)
        return None


async def _run_blocking(func: Callable[..., T], *args: Any) -> T:
    """Run blocking file/CPU work off the event loop."""
    import anyio

    return await anyio.to_thread.run_sync(func, *args)
