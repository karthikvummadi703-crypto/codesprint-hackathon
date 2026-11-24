"""Additional knowledge-base route coverage: validation, limits and store failures."""

from __future__ import annotations

import dataclasses

import anyio
import pytest
from fastapi.testclient import TestClient

import api.rag as rag_api
from config import get_settings
from errors import AppError
from services import rag_service


@pytest.mark.parametrize("filename", ["notes.exe", "no-extension"])
def test_upload_rejects_unsupported_extensions(
    client: TestClient, auth: dict[str, str], filename: str
) -> None:
    response = client.post(
        "/api/rag/upload", headers=auth, files={"file": (filename, b"data", "application/octet-stream")}
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Only PDF, CSV and TXT files are supported."}


def test_upload_accepts_an_uppercase_extension_and_keeps_the_original_filename(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, str, bytes]] = []

    def process(uid: str, filename: str, data: bytes) -> dict[str, object]:
        calls.append((uid, filename, data))
        return {
            "fileId": "f1",
            "fileName": filename,
            "chunkCount": 2,
            "textPreview": "clean text",
        }

    monkeypatch.setattr(rag_service, "process_document", process)

    response = client.post(
        "/api/rag/upload", headers=auth, files={"file": ("REPORT.PDF", b"clean text", "application/pdf")}
    )

    assert response.status_code == 200
    assert response.json() == {
        "fileId": "f1",
        "fileName": "REPORT.PDF",
        "chunkCount": 2,
        "textPreview": "clean text",
    }
    assert calls == [("test-user", "REPORT.PDF", b"clean text")]


def test_upload_rejects_an_empty_file(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post("/api/rag/upload", headers=auth, files={"file": ("empty.txt", b"", "text/plain")})
    assert response.status_code == 400
    assert response.json() == {"detail": "The uploaded file is empty."}


def test_upload_rejects_a_file_over_the_configured_limit(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = dataclasses.replace(get_settings(), max_upload_bytes=600_000)
    monkeypatch.setattr(rag_api, "get_settings", lambda: settings)

    response = client.post(
        "/api/rag/upload",
        headers=auth,
        files={"file": ("large.txt", b"x" * 600_001, "text/plain")},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "File exceeds the 1MB limit."}


def test_upload_translates_a_store_failure_into_a_client_error(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(uid: str, filename: str, data: bytes) -> dict[str, object]:
        raise rag_service.RagStoreError("could not extract text from this file")

    monkeypatch.setattr(rag_service, "process_document", broken)

    response = client.post(
        "/api/rag/upload", headers=auth, files={"file": ("bad.txt", b"some bytes", "text/plain")}
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "could not extract text from this file"}


def test_list_files_returns_only_the_caller_documents(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[str] = []

    def documents(uid: str) -> list[dict[str, object]]:
        seen.append(uid)
        return [
            {"fileId": "f1", "fileName": "one.txt", "chunkCount": 1},
            {"fileId": "f2", "fileName": "two.csv", "chunkCount": 3},
        ]

    monkeypatch.setattr(rag_service, "list_documents", documents)

    response = client.get("/api/rag/files", headers=auth)

    assert response.status_code == 200
    assert response.json() == {
        "files": [
            {"fileId": "f1", "fileName": "one.txt", "chunkCount": 1},
            {"fileId": "f2", "fileName": "two.csv", "chunkCount": 3},
        ]
    }
    assert seen == ["test-user"]


@pytest.mark.parametrize("file_id", ["a\\b", "x" * 129])
def test_delete_rejects_unsafe_or_oversized_identifiers(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch, file_id: str
) -> None:
    def never_called(uid: str, identifier: str) -> bool:
        raise AssertionError("store must not be touched for an invalid identifier")

    monkeypatch.setattr(rag_service, "delete_document", never_called)

    response = client.delete(f"/api/rag/files/{file_id}", headers=auth)

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid file identifier."}


def test_delete_rejects_a_slash_before_touching_the_store() -> None:
    with pytest.raises(AppError, match=r"^Invalid file identifier\.$"):
        anyio.run(rag_api.delete_file, "test-user", "a/b")


def test_delete_reports_a_missing_document(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def missing(uid: str, identifier: str) -> bool:
        return False

    monkeypatch.setattr(rag_service, "delete_document", missing)

    response = client.delete("/api/rag/files/unknown", headers=auth)

    assert response.status_code == 404
    assert response.json() == {"detail": "File not found in your knowledge base."}


def test_delete_removes_a_document_in_the_caller_namespace(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[str, str]] = []

    def remove(uid: str, identifier: str) -> bool:
        seen.append((uid, identifier))
        return True

    monkeypatch.setattr(rag_service, "delete_document", remove)

    response = client.delete("/api/rag/files/file-7", headers=auth)

    assert response.status_code == 200
    assert response.json() == {"status": "deleted", "fileId": "file-7"}
    assert seen == [("test-user", "file-7")]


@pytest.mark.parametrize(
    ("header", "detail"),
    [(None, "Missing authentication token"), ("Bearer dev:", "Malformed authentication token")],
)
def test_private_knowledge_base_routes_require_a_valid_token(
    client: TestClient, header: str | None, detail: str
) -> None:
    headers = {} if header is None else {"Authorization": header}

    response = client.get("/api/rag/files", headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": detail}
