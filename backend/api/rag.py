"""Knowledge-base document routes."""

from __future__ import annotations

import anyio
from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from api.deps import CurrentUid
from config import get_settings
from errors import AppError, NotFoundError
from logging_config import get_logger
from schemas import RagFileListResponse, RagUploadResponse
from services import rag_service

log = get_logger("airguard.api.rag")
router = APIRouter(prefix="/api/rag", tags=["knowledge base"])


@router.post("/upload", response_model=RagUploadResponse)
async def upload(uid: CurrentUid, file: Annotated[UploadFile, File(...)]) -> RagUploadResponse:
    """Index a PDF/CSV/TXT report into the caller's personal knowledge base."""
    settings = get_settings()
    filename = (file.filename or "document").strip()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if extension not in rag_service.ALLOWED_EXTENSIONS:
        raise AppError("Only PDF, CSV and TXT files are supported.")

    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        limit_mb = round(settings.max_upload_bytes / (1024 * 1024))
        raise AppError(f"File exceeds the {limit_mb}MB limit.", 413)
    if not data:
        raise AppError("The uploaded file is empty.")

    try:
        result = await anyio.to_thread.run_sync(
            rag_service.process_document, uid, filename, data
        )
    except rag_service.RagStoreError as exc:
        raise AppError(str(exc)) from exc

    return RagUploadResponse(**result)


@router.get("/files", response_model=RagFileListResponse)
async def list_files(uid: CurrentUid) -> RagFileListResponse:
    """Documents indexed for the caller."""
    files = await anyio.to_thread.run_sync(rag_service.list_documents, uid)
    return RagFileListResponse(files=files)


@router.delete("/files/{file_id}")
async def delete_file(uid: CurrentUid, file_id: str) -> dict:
    """Remove one document from the caller's knowledge base."""
    if len(file_id) > 128 or any(ch in file_id for ch in "/\\"):
        raise AppError("Invalid file identifier.")
    removed = await anyio.to_thread.run_sync(rag_service.delete_document, uid, file_id)
    if not removed:
        raise NotFoundError("File not found in your knowledge base.")
    return {"status": "deleted", "fileId": file_id}
