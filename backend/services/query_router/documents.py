"""Document-aware routing helpers."""

from __future__ import annotations

# Words that refer to something the user uploaded. Checked separately from the
# ordered rules so that "compare the document findings with current conditions"
# can be recognised as a document *and* environment question: the ordered rules
# would otherwise stop at "documents" and the model would never see live data to
# compare against.
_DOC_TERMS = (
    "document", "report", "pdf", "uploaded", "upload", "attachment", "attached",
    "my file", "the file", "this file", "knowledge base", "csv",
)

# Questions about a document as a whole, which relevance ranking cannot answer.
_SUMMARY_TERMS = (
    "summarise", "summarize", "summary", "overview of", "key findings",
    "main findings", "important findings", "what is in this", "what does it say",
    "explain the", "describe the", "highlight", "takeaways", "conclusion",
)

# An environmental topic appearing alongside a document reference.
_ENV_TERMS = (
    "weather", "temperature", "rain", "rainfall", "humidity", "wind", "forecast",
    "aqi", "air quality", "pollution", "pollutant", "pm2.5", "pm10", "no2", "o3",
    "outdoor", "safe", "health", "compare", "current conditions", "now", "today",
)


def mentions_documents(message: str) -> bool:
    lowered = f" {message.lower().strip()} "
    return any(term in lowered for term in _DOC_TERMS)


def is_summary_request(message: str) -> bool:
    lowered = f" {message.lower().strip()} "
    return any(term in lowered for term in _SUMMARY_TERMS)
