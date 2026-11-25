"""RAG upload and document listing schemas."""

from __future__ import annotations

from pydantic import BaseModel


class RagUploadResponse(BaseModel):
    fileId: str
    fileName: str
    chunkCount: int
    textPreview: str


class RagFileOut(BaseModel):
    fileId: str
    fileName: str
    chunkCount: int


class RagFileListResponse(BaseModel):
    files: list[RagFileOut]
