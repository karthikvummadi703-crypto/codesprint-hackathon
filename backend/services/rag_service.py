import io
import json
import math
import os
import re
import time
from collections import Counter

from PyPDF2 import PdfReader

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(DATA_DIR, exist_ok=True)

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def _store_path(uid: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", uid) or "dev-user"
    return os.path.join(DATA_DIR, f"{safe}.json")


def _load_store(uid: str) -> dict:
    path = _store_path(uid)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_store(uid: str, store: dict):
    with open(_store_path(uid), "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False)


def _extract_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if lower.endswith(".csv"):
        text = data.decode("utf-8", errors="replace")
        rows = [line for line in text.splitlines() if line.strip()]
        header = rows[0] if rows else ""
        body = rows[1:]
        chunks = []
        for i in range(0, len(body), 20):
            block = [header] + body[i : i + 20]
            chunks.append(" | ".join(block))
        return "\n\n".join(chunks)
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


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def process_document(uid: str, filename: str, data: bytes) -> dict:
    text = _extract_text(filename, data)
    chunks = _chunk_text(text)
    file_id = f"file-{int(time.time() * 1000)}"
    store = _load_store(uid)
    store.setdefault("files", {})
    store["files"][file_id] = {
        "fileName": filename,
        "chunks": chunks,
        "createdAt": time.time(),
    }
    _save_store(uid, store)
    return {
        "fileId": file_id,
        "fileName": filename,
        "chunkCount": len(chunks),
        "textPreview": (chunks[0][:200] if chunks else ""),
    }


def _idf(uid: str):
    store = _load_store(uid)
    docs = []
    for file_id, meta in store.get("files", {}).items():
        docs.extend(meta.get("chunks", []))
    n = len(docs)
    df = Counter()
    for doc in docs:
        for term in set(_tokens(doc)):
            df[term] += 1
    return docs, {term: math.log((1 + n) / (1 + count)) + 1 for term, count in df.items()}, n


def retrieve(uid: str, query: str, top_k: int = 4) -> list[dict]:
    docs, idf, n = _idf(uid)
    if not docs:
        return []
    q_vec = Counter(_tokens(query))

    def norm(vec):
        return math.sqrt(sum(v * v for v in vec.values()) or 1)

    def score(doc):
        d_vec = Counter(_tokens(doc))
        common = set(q_vec) & set(d_vec)
        s = sum(q_vec[t] * d_vec[t] * idf.get(t, 1) for t in common)
        return s / (norm(q_vec) * norm(d_vec))

    scored = sorted(((score(d), d) for d in docs), key=lambda x: x[0], reverse=True)
    return [{"chunk": d, "score": round(s, 4)} for s, d in scored[:top_k] if s > 0]


def list_documents(uid: str) -> list[dict]:
    store = _load_store(uid)
    return [
        {"fileId": fid, "fileName": m.get("fileName", ""), "chunkCount": len(m.get("chunks", []))}
        for fid, m in store.get("files", {}).items()
    ]


def delete_document(uid: str, file_id: str) -> bool:
    store = _load_store(uid)
    files = store.get("files", {})
    if file_id in files:
        del files[file_id]
        _save_store(uid, store)
        return True
    return False
