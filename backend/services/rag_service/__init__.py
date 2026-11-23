"""RAG service package facade."""

from __future__ import annotations

# Re-export patchable/common module deps
# Constants / state
import time
import uuid

from . import _index, _ingest, _store
from ._index import Counter, math
from ._ingest import PdfReader, io
from ._store import (
    ALLOWED_EXTENSIONS,
    BASE_DIR,
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    DATA_DIR,
    MAX_FILES_PER_USER,
    PDF_MAGIC,
    RagStoreError,
    _filesystem_writable,
    _index_cache,
    _lock,
    _memory_stores,
    hashlib,
    json,
    log,
    os,
    re,
    threading,
)

# Public/internal functions - keep names on facade for monkeypatching
_safe_uid = _store._safe_uid
_store_path = _store._store_path
_fs_is_writable = _store._fs_is_writable
_firestore_collection = _store._firestore_collection
_load_store = _store._load_store
_save_store = _store._save_store
_invalidate_index = _store._invalidate_index

_extract_text = _ingest._extract_text
_chunk_text = _ingest._chunk_text
process_document = _ingest.process_document

_tokens = _index._tokens
_build_index = _index._build_index
_get_index = _index._get_index
retrieve = _index.retrieve
overview = _index.overview
list_documents = _index.list_documents
delete_document = _index.delete_document

__all__ = [
    "BASE_DIR",
    "DATA_DIR",
    "CHUNK_SIZE",
    "CHUNK_OVERLAP",
    "MAX_FILES_PER_USER",
    "ALLOWED_EXTENSIONS",
    "PDF_MAGIC",
    "RagStoreError",
    "process_document",
    "retrieve",
    "overview",
    "list_documents",
    "delete_document",
]
