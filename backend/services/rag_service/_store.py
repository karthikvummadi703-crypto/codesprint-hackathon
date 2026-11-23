"""Storage/persistence for RAG documents."""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from typing import Any, cast

from logging_config import get_logger

log = get_logger("airguard.rag")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
MAX_FILES_PER_USER = 50
ALLOWED_EXTENSIONS = ("pdf", "csv", "txt")
PDF_MAGIC = b"%PDF-"

_memory_stores: dict[str, dict] = {}
_index_cache: dict[str, tuple] = {}
_lock = threading.RLock()
_filesystem_writable: bool | None = None


class RagStoreError(RuntimeError):
    pass


def _svc() -> Any:
    import services.rag_service as svc

    return svc


def _safe_uid(uid: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", uid)
    if safe and safe == uid:
        return uid
    digest = hashlib.sha256(uid.encode("utf-8")).hexdigest()[:12]
    return f"{safe or 'user'}-{digest}"


def _store_path(uid: str) -> str:
    svc = _svc()
    return cast(str, svc.os.path.join(svc.DATA_DIR, f"{svc._safe_uid(uid)}.json"))


def _fs_is_writable() -> bool:
    svc = _svc()
    if svc._filesystem_writable is not None:
        return cast(bool, svc._filesystem_writable)
    try:
        svc.os.makedirs(svc.DATA_DIR, exist_ok=True)
        probe = svc.os.path.join(svc.DATA_DIR, ".write-probe")
        with open(probe, "w", encoding="utf-8") as handle:
            handle.write("ok")
        svc.os.remove(probe)
        svc._filesystem_writable = True
    except Exception as exc:  # noqa: BLE001 - filesystem probe failure falls back to memory/firestore
        svc.log.warning("RAG data directory is not writable (%s); using Firestore or memory", type(exc).__name__)
        svc._filesystem_writable = False
    return cast(bool, svc._filesystem_writable)


def _firestore_collection() -> Any:
    from services import firebase_service

    db = firebase_service.get_firestore()
    if db is None:
        return None
    try:
        return db.collection("rag_documents")
    except Exception:  # noqa: BLE001 - collection access failure disables Firestore path
        return None


def _load_store(uid: str) -> dict:
    svc = _svc()
    collection = svc._firestore_collection()
    if collection is not None:
        try:
            doc = collection.document(svc._safe_uid(uid)).get()
            if doc.exists:
                return {"files": (doc.to_dict() or {}).get("files") or {}}
        except Exception as exc:  # noqa: BLE001 - read failure falls back to local/memory store
            svc.log.warning("Firestore read failed for RAG store: %s", type(exc).__name__)

    if svc._fs_is_writable():
        path = svc._store_path(uid)
        if svc.os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as handle:
                    return cast(dict, json.load(handle))
            except Exception as exc:  # noqa: BLE001 - corrupt/unreadable file falls back to memory
                svc.log.warning("could not read RAG store file: %s", type(exc).__name__)

    return cast(dict, svc._memory_stores.setdefault(uid, {"files": {}}))


def _save_store(uid: str, store: dict) -> None:
    svc = _svc()
    collection = svc._firestore_collection()
    if collection is not None:
        try:
            collection.document(svc._safe_uid(uid)).set({"files": store.get("files", {})})
            return
        except Exception as exc:  # noqa: BLE001 - write failure falls back to local/memory store
            svc.log.warning("Firestore write failed for RAG store: %s", type(exc).__name__)

    if svc._fs_is_writable():
        try:
            with open(svc._store_path(uid), "w", encoding="utf-8") as handle:
                json.dump(store, handle, ensure_ascii=False)
            return
        except Exception as exc:  # noqa: BLE001 - write failure falls back to memory store
            svc.log.warning("could not write RAG store file: %s", type(exc).__name__)

    svc._memory_stores[uid] = store


def _invalidate_index(uid: str) -> None:
    _svc()._index_cache.pop(uid, None)
