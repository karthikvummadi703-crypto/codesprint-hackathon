import os

import httpx

LLM_API_KEY = os.getenv("LLM_API_KEY")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = (
    "You are AirGuard AI, a helpful environmental intelligence assistant. "
    "Answer questions about air quality, pollution, forecasts, health impacts, "
    "and carbon footprint. Use the provided context to answer questions about the user's "
    "recent data, location, history, or uploaded documents. "
    "If the user's current location is provided, tailor your responses specifically to that location's "
    "air quality conditions, health advisories, and environmental data. "
    "If the context is missing or does "
    "not contain enough information to answer general questions (e.g. general explanations, "
    "scientific concepts, general tips), answer using your general knowledge. "
    "Keep answers concise, helpful, and practical. Use markdown lists when helpful."
)


def _format_context(aq_history, predictions, carbon_trips, rag_chunks, current_location=None) -> str:
    parts = []
    if current_location:
        parts.append(f"USER'S CURRENT LOCATION: {current_location}")
    if aq_history:
        recent = list(aq_history)[:5]
        lines = [
            f"- {r.get('timestamp', '')}: AQI {r.get('aqi')} ({r.get('status')}), dominant {r.get('dominantPollutant')}, location {r.get('location')}"
            for r in recent
        ]
        parts.append("RECENT AIR QUALITY HISTORY:\n" + "\n".join(lines))
    if predictions:
        lines = [
            f"- {p.get('label', p.get('timeOffsetHours'))}: AQI {p.get('aqi')} ({p.get('status')}), confidence {p.get('confidence')}"
            for p in predictions[:5]
        ]
        parts.append("24H FORECAST:\n" + "\n".join(lines))
    if carbon_trips:
        lines = [
            f"- {t.get('date', '')}: {t.get('origin')} -> {t.get('destination')}, {t.get('distanceKm')} km by {t.get('mode')}, {t.get('co2eKg')} kg CO2e"
            for t in carbon_trips[:10]
        ]
        parts.append("CARBON TRIP HISTORY:\n" + "\n".join(lines))
    if rag_chunks:
        docs = "\n\n".join(f"[chunk {i + 1}] {c['chunk']}" for i, c in enumerate(rag_chunks))
        parts.append("UPLOADED DOCUMENT CONTEXT:\n" + docs)
    return "\n\n".join(parts)


async def generate_response(message: str, context_text: str) -> str:
    if not LLM_API_KEY:
        return fallback_response(message, context_text)

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                res = await client.post(
                    f"{LLM_BASE_URL.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {LLM_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": LLM_MODEL,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "system", "content": f"AVAILABLE CONTEXT:\n{context_text}"},
                            {"role": "user", "content": message},
                        ],
                        "temperature": 0.4,
                    },
                )
                if res.status_code == 429 and attempt == 0:
                    import asyncio
                    await asyncio.sleep(2)
                    continue
                if res.status_code != 200:
                    return fallback_response(message, context_text, reason=f"LLM error {res.status_code}")
                data = res.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception:
            if attempt == 0:
                import asyncio
                await asyncio.sleep(1)
                continue
            return fallback_response(message, context_text, reason="LLM unavailable")
    return fallback_response(message, context_text, reason="LLM rate limited")


def fallback_response(message: str, context_text: str, reason: str = "LLM API key not configured") -> str:
    lower = message.lower()

    # Build intelligent response from context
    if context_text:
        summary_parts = []
        if "AIR QUALITY" in context_text.upper():
            summary_parts.append("air quality data")
        if "FORECAST" in context_text.upper():
            summary_parts.append("forecast predictions")
        if "CARBON" in context_text.upper():
            summary_parts.append("carbon footprint data")
        if "DOCUMENT" in context_text.upper():
            summary_parts.append("uploaded documents")

        available = ", ".join(summary_parts) if summary_parts else "your stored history"

        return (
            f"Based on your available {available}, here is a summary:\n\n"
            f"{context_text}\n\n"
            f"💡 *Note: Using prototype response ({reason}). "
            f"For richer AI analysis, the LLM service needs to be available.*"
        )

    return (
        "I don't have personal context stored for your account yet. Here's what you can do:\n\n"
        "• **Dashboard**: Check a location to record air quality history\n"
        "• **Carbon Calculator**: Save trips to build your carbon profile\n"
        "• **Upload Documents**: Upload environmental reports for me to analyze\n\n"
        f"💡 *Note: Using prototype response ({reason}).*"
    )
