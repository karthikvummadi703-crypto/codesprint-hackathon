"""RAG retrieval/indexing."""

from __future__ import annotations

import math
import re
from collections import Counter
from types import ModuleType
from typing import cast

_Index = tuple[list[tuple[str, str, str]], dict[str, float], int]


def _svc() -> ModuleType:
    import services.rag_service as svc

    return svc


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _build_index(uid: str) -> _Index:
    """Chunk corpus for a user, as (file_id, file_name, chunk) triples."""
    svc = _svc()
    store = svc._load_store(uid)
    docs: list[tuple[str, str, str]] = []
    for file_id, meta in store.get("files", {}).items():
        file_name = meta.get("fileName") or file_id
        docs.extend((file_id, file_name, chunk) for chunk in meta.get("chunks") or [])
    if not docs:
        return docs, {}, 0
    document_frequency: Counter = Counter()
    for _, _, doc in docs:
        document_frequency.update(set(_tokens(doc)))
    total = len(docs)
    idf = {term: math.log((1 + total) / (1 + count)) + 1 for term, count in document_frequency.items()}
    return docs, idf, total


def _get_index(uid: str) -> _Index:
    svc = _svc()
    cached = svc._index_cache.get(uid)
    if cached is not None:
        return cast(_Index, cached)
    built = cast(_Index, svc._build_index(uid))
    svc._index_cache[uid] = built
    return built


def retrieve(
    uid: str,
    query: str,
    top_k: int = 4,
    file_ids: list[str] | None = None,
) -> list[dict]:
    """Return the most relevant chunks for a query, most relevant first."""
    svc = _svc()
    docs, idf, _ = svc._get_index(uid)
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
    """Representative excerpts for a whole document."""
    svc = _svc()
    store = svc._load_store(uid)
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
        results.extend(
            {
                "fileId": file_id,
                "fileName": meta.get("fileName") or file_id,
                "chunk": chunk,
                "score": 0.0,
            }
            for chunk in picked
        )
    return results


def list_documents(uid: str) -> list[dict]:
    svc = _svc()
    store = svc._load_store(uid)
    return [
        {
            "fileId": file_id,
            "fileName": meta.get("fileName", ""),
            "chunkCount": len(meta.get("chunks") or []),
        }
        for file_id, meta in store.get("files", {}).items()
    ]


def delete_document(uid: str, file_id: str) -> bool:
    svc = _svc()
    with svc._lock:
        store = svc._load_store(uid)
        files = store.get("files", {})
        if file_id not in files:
            return False
        del files[file_id]
        svc._save_store(uid, store)
        svc._invalidate_index(uid)
    return True
