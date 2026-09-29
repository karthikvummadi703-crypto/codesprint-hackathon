"""Retrieval-augmented generation over user-uploaded environmental reports.

Persistence is a per-uid JSON document store with three tiers, in order:

1. Firestore, when the Firebase Admin SDK is configured. This is the only tier
   that survives a container restart.
2. A local JSON file under `backend/data/`.
3. Memory, when the filesystem is read-only (common on PaaS filesystems).

The previous version wrote only to tier 2 and created the directory at import
time, which meant every redeploy discarded the knowledge base and a read-only
filesystem crashed the process on boot. Both are fixed here.

Retrieval is TF-IDF cosine similarity over 500-character chunks. The index is
cached per uid and invalidated on write, so repeated chat turns do not re-tokenize
the whole corpus.
"""

from __future__ import annotations

import io
import json
import math
import os
import re
import threading
import time
import uuid
from collections import Counter

from logging_config import get_logger

log = get_logger("airguard.rag")

try:
    from PyPDF2 import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore[assignment]

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
MAX_FILES_PER_USER = 50
ALLOWED_EXTENSIONS = ("pdf", "csv", "txt")

# A real PDF always begins with this header. Checking it rejects a renamed
# executable or script before a parser is handed attacker-controlled bytes.
PDF_MAGIC = b"%PDF-"

# uid -> {"files": {...}, "index": _Index | None}
_memory_stores: dict[str, dict] = {}
_index_cache: dict[str, tuple] = {}
_lock = threading.RLock()
_filesystem_writable: bool | None = None


class RagStoreError(RuntimeError):
    pass


# --------------------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------------------


def _safe_uid(uid: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", uid) or "anonymous"


def _store_path(uid: str) -> str:
    return os.path.join(DATA_DIR, f"{_safe_uid(uid)}.json")


def _fs_is_writable() -> bool:
    global _filesystem_writable
    if _filesystem_writable is not None:
        return _filesystem_writable
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        probe = os.path.join(DATA_DIR, ".write-probe")
        with open(probe, "w", encoding="utf-8") as handle:
            handle.write("ok")
        os.remove(probe)
        _filesystem_writable = True
    except Exception as exc:
        log.warning("RAG data directory is not writable (%s); using Firestore or memory", type(exc).__name__)
        _filesystem_writable = False
    return _filesystem_writable


def _firestore_collection():
    from services import firebase_service

    db = firebase_service.get_firestore()
    if db is None:
        return None
    try:
        return db.collection("rag_documents")
    except Exception:
        return None


def _load_store(uid: str) -> dict:
    collection = _firestore_collection()
    if collection is not None:
        try:
            doc = collection.document(_safe_uid(uid)).get()
            if doc.exists:
                return {"files": (doc.to_dict() or {}).get("files") or {}}
        except Exception as exc:
            log.warning("Firestore read failed for RAG store: %s", type(exc).__name__)

    if _fs_is_writable():
        path = _store_path(uid)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    return json.load(handle)
            except Exception as exc:
                log.warning("could not read RAG store file: %s", type(exc).__name__)

    return _memory_stores.setdefault(uid, {"files": {}})


def _save_store(uid: str, store: dict) -> None:
    collection = _firestore_collection()
    if collection is not None:
        try:
            collection.document(_safe_uid(uid)).set({"files": store.get("files", {})})
            return
        except Exception as exc:
            log.warning("Firestore write failed for RAG store: %s", type(exc).__name__)

    if _fs_is_writable():
        try:
            with open(_store_path(uid), "w", encoding="utf-8") as handle:
                json.dump(store, handle, ensure_ascii=False)
            return
        except Exception as exc:
            log.warning("could not write RAG store file: %s", type(exc).__name__)

    _memory_stores[uid] = store


def _invalidate_index(uid: str) -> None:
    _index_cache.pop(uid, None)


# --------------------------------------------------------------------------------------
# Ingestion
# --------------------------------------------------------------------------------------


def _extract_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        if not data.lstrip()[: len(PDF_MAGIC)] == PDF_MAGIC:
            raise RagStoreError("That file is not a valid PDF.")
        if PdfReader is None:
            raise RagStoreError("PDF support is unavailable: install PyPDF2 to enable PDF uploads.")
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                # PyPDF2 can return a reader whose pages raise on access; an
                # empty password is tried first so a merely "protected" file
                # still works, and anything else is reported clearly.
                try:
                    reader.decrypt("")
                except Exception as exc:  # noqa: BLE001 - surfaced as a user error
                    raise RagStoreError("This PDF is password protected and cannot be read.") from exc
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except RagStoreError:
            raise
        except Exception as exc:
            raise RagStoreError("The PDF could not be parsed. It may be encrypted or corrupted.") from exc

    if lower.endswith(".csv"):
        text = data.decode("utf-8", errors="replace")
        rows = [line for line in text.splitlines() if line.strip()]
        if not rows:
            return ""
        header, body = rows[0], rows[1:]
        # Re-emit the header with every block so each chunk stays self-describing.
        blocks = [" | ".join([header] + body[i : i + 20]) for i in range(0, len(body), 20)]
        return "\n\n".join(blocks)

    return data.decode("utf-8", errors="replace")


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


def process_document(uid: str, filename: str, data: bytes) -> dict:
    """Extract, chunk and persist an uploaded document for later retrieval."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise RagStoreError("Only PDF, CSV and TXT files are supported.")

    text = _extract_text(filename, data)
    chunks = _chunk_text(text)
    if not chunks:
        raise RagStoreError("No readable text was found in that file.")

    with _lock:
        store = _load_store(uid)
        files = store.setdefault("files", {})
        if len(files) >= MAX_FILES_PER_USER:
            oldest = min(files.items(), key=lambda kv: kv[1].get("createdAt", 0))[0]
            del files[oldest]
            log.info("pruned oldest RAG document for user (cap=%d)", MAX_FILES_PER_USER)

        file_id = f"file-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
        files[file_id] = {
            "fileName": os.path.basename(filename)[:200],
            "chunks": chunks,
            "createdAt": time.time(),
        }
        _save_store(uid, store)
        _invalidate_index(uid)

    log.info("indexed RAG document user=%s file=%s chunks=%d", _safe_uid(uid), file_id, len(chunks))
    return {
        "fileId": file_id,
        "fileName": os.path.basename(filename)[:200],
        "chunkCount": len(chunks),
        "textPreview": chunks[0][:200],
    }


# --------------------------------------------------------------------------------------
# Retrieval
# --------------------------------------------------------------------------------------


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _build_index(uid: str):
    """Chunk corpus for a user, as (file_id, file_name, chunk) triples.

    The document each chunk came from is kept alongside it so retrieval can scope
    to a single attached file and so a reply can name the source document
    instead of presenting an unattributed excerpt.
    """
    store = _load_store(uid)
    docs: list[tuple[str, str, str]] = []
    for file_id, meta in store.get("files", {}).items():
        file_name = meta.get("fileName") or file_id
        for chunk in meta.get("chunks") or []:
            docs.append((file_id, file_name, chunk))
    if not docs:
        return docs, {}, 0
    document_frequency: Counter = Counter()
    for _, _, doc in docs:
        document_frequency.update(set(_tokens(doc)))
    total = len(docs)
    idf = {term: math.log((1 + total) / (1 + count)) + 1 for term, count in document_frequency.items()}
    return docs, idf, total


def _get_index(uid: str):
    cached = _index_cache.get(uid)
    if cached is not None:
        return cached
    built = _build_index(uid)
    _index_cache[uid] = built
    return built


def retrieve(
    uid: str,
    query: str,
    top_k: int = 4,
    file_ids: list[str] | None = None,
) -> list[dict]:
    """Return the most relevant chunks for a query, most relevant first.

    `file_ids` restricts the search to specific documents in the caller's own
    knowledge base. Unknown ids are ignored rather than treated as an error, and
    the uid namespace still applies, so scoping can never reach another user's
    upload.
    """
    docs, idf, _ = _get_index(uid)
    allowed = set(file_ids) if file_ids else None
    if allowed:
        docs = [entry for entry in docs if entry[0] in allowed]
    if not docs:
        return []

    query_vector = Counter(_tokens(query))
    if not query_vector:
        return []

    query_norm = math.sqrt(sum(v * v for v in query_vector.values())) or 1.0

    scored: list[tuple[float, str, str, str]] = []
    for file_id, file_name, doc in docs:
        doc_vector = Counter(_tokens(doc))
        if not doc_vector:
            continue
        overlap = set(query_vector) & set(doc_vector)
        if not overlap:
            continue
        raw = sum(query_vector[t] * doc_vector[t] * idf.get(t, 1.0) for t in overlap)
        if raw <= 0:
            continue
        doc_norm = math.sqrt(sum(v * v for v in doc_vector.values())) or 1.0
        scored.append((raw / (query_norm * doc_norm), file_id, file_name, doc))

    if not scored:
        return []
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        {"fileId": file_id, "fileName": file_name, "chunk": chunk, "score": round(score, 4)}
        for score, file_id, file_name, chunk in scored[: max(1, top_k)]
        if score > 0
    ]


def overview(uid: str, file_ids: list[str] | None = None, top_k: int = 4) -> list[dict]:
    """Representative excerpts for a whole document, for "summarise this" questions.

    A request such as "summarise this document" shares almost no vocabulary with
    the report it refers to, so relevance ranking returns nothing at all. This
    takes the opening chunk of each document plus an even spread of the rest,
    which gives the model the shape of the report without sending all of it.
    """
    store = _load_store(uid)
    files = store.get("files", {})
    if file_ids:
        wanted = [(file_id, files[file_id]) for file_id in file_ids if file_id in files]
    else:
        wanted = list(files.items())

    results: list[dict] = []
    per_file = max(1, top_k)
    for file_id, meta in wanted[:4]:
        chunks = meta.get("chunks") or []
        if not chunks:
            continue
        step = max(1, len(chunks) // per_file)
        picked = chunks[::step][:per_file]
        for chunk in picked:
            results.append(
                {
                    "fileId": file_id,
                    "fileName": meta.get("fileName") or file_id,
                    "chunk": chunk,
                    "score": 0.0,
                }
            )
    return results


def list_documents(uid: str) -> list[dict]:
    store = _load_store(uid)
    return [
        {
            "fileId": file_id,
            "fileName": meta.get("fileName", ""),
            "chunkCount": len(meta.get("chunks") or []),
        }
        for file_id, meta in store.get("files", {}).items()
    ]


def delete_document(uid: str, file_id: str) -> bool:
    with _lock:
        store = _load_store(uid)
        files = store.get("files", {})
        if file_id not in files:
            return False
        del files[file_id]
        _save_store(uid, store)
        _invalidate_index(uid)
    return True
