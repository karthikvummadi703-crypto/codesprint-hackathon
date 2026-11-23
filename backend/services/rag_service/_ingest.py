"""RAG ingestion: extraction, chunking, document processing."""

from __future__ import annotations

import io
import os
import re
from types import ModuleType
from typing import Any

PdfReader: Any
try:
    from PyPDF2 import PdfReader as _PdfReader

    PdfReader = _PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None



def _svc() -> ModuleType:
    import services.rag_service as svc

    return svc


def _extract_text(filename: str, data: bytes) -> str:
    svc = _svc()
    lower = filename.lower()
    if lower.endswith(".pdf"):
        if not data.lstrip()[: len(svc.PDF_MAGIC)] == svc.PDF_MAGIC:
            raise svc.RagStoreError("That file is not a valid PDF.")
        if svc.PdfReader is None:
            raise svc.RagStoreError("PDF support is unavailable: install PyPDF2 to enable PDF uploads.")
        try:
            reader = svc.PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                try:
                    reader.decrypt("")
                except Exception as exc:
                    raise svc.RagStoreError("This PDF is password protected and cannot be read.") from exc
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except svc.RagStoreError:
            raise
        except Exception as exc:
            raise svc.RagStoreError("The PDF could not be parsed. It may be encrypted or corrupted.") from exc

    if lower.endswith(".csv"):
        text = data.decode("utf-8", errors="replace")
        rows = [line for line in text.splitlines() if line.strip()]
        if not rows:
            return ""
        header, body = rows[0], rows[1:]
        blocks = [" | ".join([header, *body[i : i + 20]]) for i in range(0, len(body), 20)]
        return "\n\n".join(blocks)

    return data.decode("utf-8", errors="replace")


def _chunk_text(text: str) -> list[str]:
    svc = _svc()
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    chunks = []
    start = 0
    while start < len(cleaned):
        chunks.append(cleaned[start : start + svc.CHUNK_SIZE])
        start += svc.CHUNK_SIZE - svc.CHUNK_OVERLAP
    return [c for c in chunks if c.strip()]


def process_document(uid: str, filename: str, data: bytes) -> dict:
    """Extract, chunk and persist an uploaded document for later retrieval."""
    svc = _svc()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in svc.ALLOWED_EXTENSIONS:
        raise svc.RagStoreError("Only PDF, CSV and TXT files are supported.")

    text = svc._extract_text(filename, data)
    chunks = svc._chunk_text(text)
    if not chunks:
        raise svc.RagStoreError("No readable text was found in that file.")

    with svc._lock:
        store = svc._load_store(uid)
        files = store.setdefault("files", {})
        if len(files) >= svc.MAX_FILES_PER_USER:
            oldest = min(files.items(), key=lambda kv: kv[1].get("createdAt", 0))[0]
            del files[oldest]
            svc.log.info("pruned oldest RAG document for user (cap=%d)", svc.MAX_FILES_PER_USER)

        file_id = f"file-{int(svc.time.time() * 1000)}-{svc.uuid.uuid4().hex[:6]}"
        files[file_id] = {
            "fileName": os.path.basename(filename)[:200],
            "chunks": chunks,
            "createdAt": svc.time.time(),
        }
        svc._save_store(uid, store)
        svc._invalidate_index(uid)

    svc.log.info("indexed RAG document user=%s file=%s chunks=%d", svc._safe_uid(uid), file_id, len(chunks))
    return {
        "fileId": file_id,
        "fileName": os.path.basename(filename)[:200],
        "chunkCount": len(chunks),
        "textPreview": chunks[0][:200],
    }
