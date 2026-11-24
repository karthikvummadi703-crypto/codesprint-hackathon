"""Additional RAG persistence, ingestion and retrieval branches."""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from pathlib import Path

import pytest

from services import firebase_service, rag_service


class _FakePage:
    def __init__(self, text: str | None = None, fails: bool = False) -> None:
        self._text = text
        self._fails = fails

    def extract_text(self) -> str:
        if self._fails:
            raise ValueError("broken page")
        return self._text or ""


class _FakeReader:
    def __init__(self, pages: list[_FakePage], encrypted: bool = False, decrypt_fails: bool = False) -> None:
        self.pages = pages
        self.is_encrypted = encrypted
        self._decrypt_fails = decrypt_fails

    def decrypt(self, password: str) -> int:
        if self._decrypt_fails:
            raise ValueError("wrong password")
        return 1 if password == "" else 0


class _FakeDocument:
    def __init__(self, payload: dict[str, object], exists: bool = True, fails: bool = False) -> None:
        self._payload = payload
        self.exists = exists
        self._fails = fails

    def to_dict(self) -> dict[str, object]:
        return self._payload

    def get(self) -> _FakeDocument:
        if self._fails:
            raise RuntimeError("read failed")
        return self


class _FakeReference:
    def __init__(self, document: _FakeDocument, fails: bool = False) -> None:
        self._document = document
        self._fails = fails
        self.written: dict[str, object] | None = None

    def get(self) -> _FakeDocument:
        return self._document.get()

    def set(self, payload: dict[str, object]) -> None:
        if self._fails:
            raise RuntimeError("write failed")
        self.written = payload


class _FakeCollection:
    def __init__(self, reference: _FakeReference) -> None:
        self._reference = reference

    def document(self, name: str) -> _FakeReference:
        assert name
        return self._reference


class _FakeDatabase:
    def __init__(self, collection: object | None = None, fails: bool = False) -> None:
        self._collection = collection
        self._fails = fails

    def collection(self, name: str) -> object:
        assert name == "rag_documents"
        if self._fails:
            raise RuntimeError("no access")
        if self._collection is None:
            raise RuntimeError("missing collection")
        return self._collection


@pytest.fixture
def isolated_rag(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(rag_service, "_firestore_collection", lambda: None)
    monkeypatch.setattr(
        rag_service, "_store_path", lambda uid: str(tmp_path / f"{rag_service._safe_uid(uid)}.json")
    )
    monkeypatch.setattr(rag_service, "_filesystem_writable", True)
    monkeypatch.setattr(rag_service, "MAX_FILES_PER_USER", 50)
    rag_service._index_cache.clear()
    rag_service._memory_stores.clear()
    yield
    rag_service._index_cache.clear()
    rag_service._memory_stores.clear()


def test_safe_uid_only_hashes_names_that_need_sanitizing() -> None:
    assert rag_service._safe_uid("plain-user_1") == "plain-user_1"
    digest = hashlib.sha256(b"a/b c").hexdigest()[:12]
    assert rag_service._safe_uid("a/b c") == f"abc-{digest}"


def test_csv_extraction_repeats_the_header_with_every_block() -> None:
    rows = [f"row{index}" for index in range(45)]
    payload = ("col1,col2\n" + "\n".join(rows)).encode("utf-8")
    text = rag_service._extract_text("data.CSV", payload)
    assert text.count("col1,col2") == 3
    assert "row0" in text
    assert "row44" in text
    assert rag_service._extract_text("empty.csv", b"\n \n") == ""


def test_plain_text_uses_replacement_characters_for_invalid_bytes() -> None:
    assert rag_service._extract_text("notes.txt", b"caf\xe9") == "caf\ufffd"


def test_encrypted_pdf_is_decrypted_with_an_empty_password(monkeypatch: pytest.MonkeyPatch) -> None:
    reader = _FakeReader([_FakePage("decrypted content")], encrypted=True)
    monkeypatch.setattr(rag_service, "PdfReader", lambda _stream: reader)
    assert "decrypted content" in rag_service._extract_text("file.pdf", b"%PDF-1.4 data")


def test_password_protected_pdf_is_reported_clearly(monkeypatch: pytest.MonkeyPatch) -> None:
    reader = _FakeReader([], encrypted=True, decrypt_fails=True)
    monkeypatch.setattr(rag_service, "PdfReader", lambda _stream: reader)
    with pytest.raises(rag_service.RagStoreError, match="password protected"):
        rag_service._extract_text("locked.pdf", b"%PDF-1.4 data")


def test_unparseable_pdf_page_is_reported_clearly(monkeypatch: pytest.MonkeyPatch) -> None:
    reader = _FakeReader([_FakePage(fails=True)])
    monkeypatch.setattr(rag_service, "PdfReader", lambda _stream: reader)
    with pytest.raises(rag_service.RagStoreError, match="could not be parsed"):
        rag_service._extract_text("broken.pdf", b"%PDF-1.4 data")


def test_missing_pdf_support_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rag_service, "PdfReader", None)
    with pytest.raises(rag_service.RagStoreError, match="PDF support is unavailable"):
        rag_service._extract_text("report.pdf", b"%PDF-1.4 data")


def test_chunking_overlaps_and_ignores_whitespace_only_text() -> None:
    assert rag_service._chunk_text("  \n\t ") == []
    chunks = rag_service._chunk_text("z" * 1200)
    assert len(chunks) == 3
    assert chunks[1].startswith("z" * (rag_service.CHUNK_SIZE - rag_service.CHUNK_OVERLAP - 1))


def test_ingestion_rejects_bad_extensions_and_empty_text(isolated_rag: None) -> None:
    with pytest.raises(rag_service.RagStoreError, match="Only PDF, CSV and TXT"):
        rag_service.process_document("u1", "notes.docx", b"content")
    with pytest.raises(rag_service.RagStoreError, match="No readable text"):
        rag_service.process_document("u1", "blank.txt", b"   ")


def test_ingestion_prunes_the_oldest_file_at_the_cap(
    monkeypatch: pytest.MonkeyPatch, isolated_rag: None
) -> None:
    monkeypatch.setattr(rag_service, "MAX_FILES_PER_USER", 2)
    clock = iter([1000.0, 1000.0, 2000.0, 2000.0, 3000.0, 3000.0])
    monkeypatch.setattr(rag_service.time, "time", clock.__next__)
    for name in ("old.txt", "middle.txt", "new.txt"):
        rag_service.process_document("u1", name, b"unique content")
    names = [entry["fileName"] for entry in rag_service.list_documents("u1")]
    assert names == ["middle.txt", "new.txt"]


def test_deletion_invalidates_the_retrieval_index(isolated_rag: None) -> None:
    record = rag_service.process_document("u1", "alpha.txt", b"Zebra metric is 42.")
    assert rag_service.retrieve("u1", "zebra")
    assert "u1" in rag_service._index_cache
    assert rag_service.delete_document("u1", record["fileId"])
    assert rag_service.retrieve("u1", "zebra") == []
    assert rag_service.delete_document("u1", record["fileId"]) is False


def test_retrieval_ignores_tokenless_queries_and_zero_top_k(isolated_rag: None) -> None:
    assert rag_service.retrieve("u1", "zebra") == []
    rag_service.process_document("u1", "alpha.txt", b"Zebra metric is 42.")
    assert rag_service.retrieve("u1", "!!!") == []
    assert rag_service.retrieve("u1", "unrelated vocabulary") == []
    assert len(rag_service.retrieve("u1", "zebra", top_k=0)) == 1


def test_firestore_store_is_preferred_over_the_local_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, isolated_rag: None
) -> None:
    reference = _FakeReference(_FakeDocument({"files": {"remote": {"chunks": ["cached"]}}}))
    collection = _FakeCollection(reference)
    monkeypatch.setattr(rag_service, "_firestore_collection", lambda: collection)
    files = rag_service._load_store("u1")["files"]
    assert list(files) == ["remote"]
    assert not (tmp_path / "u1.json").exists()
    rag_service._save_store("u1", {"files": {"written": {"chunks": ["value"]}}})
    assert reference.written == {"files": {"written": {"chunks": ["value"]}}}


def test_failed_firestore_access_falls_back_to_the_local_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, isolated_rag: None
) -> None:
    reference = _FakeReference(_FakeDocument({}, fails=True), fails=True)
    monkeypatch.setattr(rag_service, "_firestore_collection", lambda: _FakeCollection(reference))
    rag_service._save_store("u1", {"files": {"local": {"chunks": ["value"]}}})
    assert (tmp_path / "u1.json").exists()
    assert list(rag_service._load_store("u1")["files"]) == ["local"]


def test_firestore_collection_returns_none_without_a_usable_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(firebase_service, "get_firestore", lambda: None)
    assert rag_service._firestore_collection() is None
    monkeypatch.setattr(firebase_service, "get_firestore", lambda: _FakeDatabase(fails=True))
    assert rag_service._firestore_collection() is None
    collection = _FakeCollection(_FakeReference(_FakeDocument({})))
    monkeypatch.setattr(firebase_service, "get_firestore", lambda: _FakeDatabase(collection))
    assert rag_service._firestore_collection() is collection


def test_memory_store_is_used_when_the_filesystem_is_read_only(
    monkeypatch: pytest.MonkeyPatch, isolated_rag: None
) -> None:
    monkeypatch.setattr(rag_service, "_fs_is_writable", lambda: False)
    record = rag_service.process_document("u1", "memo.txt", b"Memory only content.")
    assert list(rag_service._memory_stores["u1"]["files"]) == [record["fileId"]]
    assert len(rag_service.list_documents("u1")) == 1


def test_unwritable_data_directory_is_cached_as_read_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, isolated_rag: None
) -> None:
    monkeypatch.setattr(rag_service, "DATA_DIR", str(tmp_path / "blocked"))
    monkeypatch.setattr(rag_service, "_filesystem_writable", None)
    attempts: list[str] = []

    def blocked_makedirs(path: str, exist_ok: bool = False) -> None:
        attempts.append(path)
        raise OSError("read only")

    monkeypatch.setattr(rag_service.os, "makedirs", blocked_makedirs)
    assert rag_service._fs_is_writable() is False
    assert rag_service._fs_is_writable() is False
    assert len(attempts) == 1


def test_overview_skips_unknown_and_chunkless_files(isolated_rag: None) -> None:
    rag_service._save_store(
        "u1",
        {
            "files": {
                "empty": {"fileName": "empty.txt", "chunks": []},
                "good": {"fileName": "good.txt", "chunks": ["first", "second", "third"]},
            }
        },
    )
    results = rag_service.overview("u1", ["missing", "empty", "good"], top_k=2)
    assert [item["fileName"] for item in results] == ["good.txt", "good.txt"]
    documents = rag_service.list_documents("u1")
    assert documents[1]["fileName"] == "good.txt"
    assert documents[1]["chunkCount"] == 3


def test_uploaded_filename_is_basename_and_capped(isolated_rag: None) -> None:
    long_name = "folder/" + "x" * 250 + ".txt"
    record = rag_service.process_document("u1", long_name, b"content")
    assert record["fileName"] == ("x" * 250 + ".txt")[:200]
    assert "folder" not in record["fileName"]
