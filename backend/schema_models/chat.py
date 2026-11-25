"""Assistant chat request and response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ChatTurnIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def strip_control_chars(cls, value: str) -> str:
        return "".join(ch for ch in value if ch == "\n" or ch == "\t" or ch.isprintable()).strip()


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    location: dict[str, Any] | None = None
    aqHistory: list[dict[str, Any]] | None = Field(default=None, max_length=50)
    carbonTrips: list[dict[str, Any]] | None = Field(default=None, max_length=200)
    predictions: list[dict[str, Any]] | None = Field(default=None, max_length=50)
    weather: dict[str, Any] | None = None
    history: list[ChatTurnIn] | None = Field(default=None, max_length=40)
    # Documents attached to this specific turn. Retrieval is scoped to these ids
    # inside the caller's own knowledge base, so a question that does not use
    # document wording ("compare that with today") still reads the attachment.
    documentIds: list[str] | None = Field(default=None, max_length=5)
    household: dict[str, Any] | None = None
    routines: list[dict[str, Any]] | None = Field(default=None, max_length=30)
    routineContext: str | None = Field(default=None, max_length=8000)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        cleaned = "".join(ch for ch in value if ch == "\n" or ch == "\t" or ch.isprintable())
        cleaned = cleaned.strip()
        if not cleaned:
            raise ValueError("message must contain printable characters")
        return cleaned

    @field_validator("documentIds")
    @classmethod
    def clean_document_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
        return cleaned or None


class ChatResponse(BaseModel):
    response: str
    contextUsed: bool
    intent: str
    contextSections: list[str]
    provider: str
    latencyMs: int
    degraded: bool = False
    dataCoverage: dict[str, bool] = Field(default_factory=dict)
