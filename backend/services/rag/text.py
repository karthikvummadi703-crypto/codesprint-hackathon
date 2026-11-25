"""Pure uid and text-processing helpers for RAG ingestion and retrieval."""

from __future__ import annotations

import hashlib
import re

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def _safe_uid(uid: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", uid)
    if safe and safe == uid:
        return uid
    # Stripping characters can collapse distinct uids onto one namespace. A
    # short digest keeps those uids separate without renaming existing stores
    # whose ids were already filesystem-safe.
    digest = hashlib.sha256(uid.encode("utf-8")).hexdigest()[:12]
    return f"{safe or 'user'}-{digest}"


def _chunk_text(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    chunks = []
    start = 0
    while start < len(cleaned):
        chunks.append(cleaned[start : start + CHUNK_SIZE])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if c.strip()]


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())
