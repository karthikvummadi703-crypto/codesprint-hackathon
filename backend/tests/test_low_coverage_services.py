from __future__ import annotations

import asyncio
import builtins
import io
import json
from datetime import date
from types import SimpleNamespace

import http_client
import httpx
import middleware
import pytest
from http_client import ProviderError
from starlette.requests import Request

from services import carbon_service, firebase_service, rag_service, security
from services import query_router as qr

FROZEN_MONOTONIC = 1000.0


def _request(headers=None, state=None, client=("1.2.3.4", 1234)):
    scope = {
        "type": "http",
        "headers": headers or [],
        "state": dict(state or {}),
        "client": client,
    }
    return Request(scope)


class TestCarbonService:
    def test_haversine_km_known_distance(self):
        assert carbon_service.haversine_km(0, 0, 0, 1) == pytest.approx(111.19, abs=0.01)
        assert carbon_service.haversine_km(17.38, 78.49, 17.38, 78.49) == 0.0

    async def test_geocode_parses_first_result_and_passes_query(self, monkeypatch):
        seen = {}

        async def fake(method, url, **kwargs):
            seen.update(method=method, url=url, **kwargs)
            return [{"lat": "17.38", "lon": "78.49"}, {"lat": "0", "lon": "0"}]

        monkeypatch.setattr(carbon_service, "get_settings", lambda: SimpleNamespace(nominatim_base_url="https://nominatim.invalid"))
        monkeypatch.setattr(carbon_service, "request_json", fake)

        assert await carbon_service._geocode("Hyderabad") == (17.38, 78.49)
        assert seen["url"] == "https://nominatim.invalid/search"
        assert seen["params"] == {"q": "Hyderabad", "format": "json", "limit": 1}
        assert seen["provider"] == "nominatim"

    async def test_geocode_provider_error_returns_empty_coordinates(self, monkeypatch):
        async def fake(*args, **kwargs):
            raise ProviderError("nominatim", "offline", 503)

        monkeypatch.setattr(carbon_service, "get_settings", lambda: SimpleNamespace(nominatim_base_url="https://nominatim.invalid"))
        monkeypatch.setattr(carbon_service, "request_json", fake)

        assert await carbon_service._geocode("Nowhere") == (None, None)

    @pytest.mark.parametrize(
        "payload",
        [[], {"lat": "1", "lon": "2"}, [{"lat": "1"}], [{"lat": "x", "lon": "2"}], [None]],
    )
    async def test_geocode_malformed_payload_returns_empty_coordinates(self, monkeypatch, payload):
        async def fake(*args, **kwargs):
            return payload

        monkeypatch.setattr(carbon_service, "get_settings", lambda: SimpleNamespace(nominatim_base_url="https://nominatim.invalid"))
        monkeypatch.setattr(carbon_service, "request_json", fake)

        assert await carbon_service._geocode("Nowhere") == (None, None)

    async def test_estimate_distance_uses_both_geocoded_endpoints(self, monkeypatch):
        places = []

        async def fake(place):
            places.append(place)
            return {"A": (17.38, 78.49), "B": (14.1489, 79.8530)}[place]

        monkeypatch.setattr(carbon_service, "_geocode", fake)

        distance = await carbon_service.estimate_distance("A", "B")
        assert places == ["A", "B"]
        assert distance == pytest.approx(carbon_service.haversine_km(17.38, 78.49, 14.1489, 79.8530), abs=0.01)

    async def test_estimate_distance_returns_none_when_endpoint_unresolvable(self, monkeypatch):
        async def fake(place):
            return (17.38, 78.49) if place == "A" else (None, None)

        monkeypatch.setattr(carbon_service, "_geocode", fake)

        assert await carbon_service.estimate_distance("A", "B") is None

    async def test_calculate_carbon_unknown_mode_falls_back_to_car(self):
        result = await carbon_service.calculate_carbon("A", "B", 100, "Rocket")

        assert result == {
            "origin": "A",
            "destination": "B",
            "distanceKm": 100.0,
            "mode": "Car",
            "co2eKg": 19.2,
            "savings": 0.0,
            "estimated": False,
        }

    async def test_calculate_carbon_auto_estimates_nonpositive_distance(self, monkeypatch):
        async def fake(origin, destination):
            assert (origin, destination) == ("A", "B")
            return 50.0

        monkeypatch.setattr(carbon_service, "estimate_distance", fake)

        result = await carbon_service.calculate_carbon("A", "B", 0, "Walking")

        assert result["distanceKm"] == 50.0
        assert result["mode"] == "Walking"
        assert result["co2eKg"] == 0.0
        assert result["savings"] == 9.6
        assert result["estimated"] is True

    async def test_calculate_carbon_clamps_distance_to_maximum(self):
        result = await carbon_service.calculate_carbon("A", "B", 50_000, "Train")

        assert result["distanceKm"] == 20_000.0
        assert result["co2eKg"] == 820.0
        assert result["savings"] == 3020.0
        assert result["estimated"] is False

    async def test_calculate_carbon_requires_distance_when_estimation_fails(self, monkeypatch):
        async def fake(*args):
            return None

        monkeypatch.setattr(carbon_service, "estimate_distance", fake)

        with pytest.raises(ValueError, match="Distance required"):
            await carbon_service.calculate_carbon("A", "B", None, "Car")


@pytest.fixture
def firebase_state(monkeypatch):
    monkeypatch.setattr(firebase_service, "_certs", {}, raising=False)
    monkeypatch.setattr(firebase_service, "_certs_fetched_at", 0.0, raising=False)
    monkeypatch.setattr(firebase_service, "_admin_initialized", False, raising=False)
    monkeypatch.setattr(firebase_service, "_firestore_client", None, raising=False)
    return firebase_service


def _firebase_settings(admin_configured=True):
    return SimpleNamespace(
        firebase_admin_configured=admin_configured,
        firebase_project_id="project-id",
        firebase_client_email="admin@example.invalid",
        firebase_private_key="private-key",
    )


class TestFirebaseCerts:
    async def test_fresh_cached_certs_skip_network(self, monkeypatch, firebase_state):
        requests = []

        async def fake(*args, **kwargs):
            requests.append(args)
            raise AssertionError("network should not be used")

        monkeypatch.setattr(firebase_service, "time", SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC))
        monkeypatch.setattr(firebase_service, "request_json", fake)
        monkeypatch.setattr(firebase_service, "_certs", {"kid": "pem"})
        monkeypatch.setattr(firebase_service, "_certs_fetched_at", FROZEN_MONOTONIC - 10)

        assert await firebase_service._load_certs() == {"kid": "pem"}
        assert requests == []

    async def test_expired_certs_are_refreshed(self, monkeypatch, firebase_state):
        calls = []

        async def fake(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return {"new-kid": 123}

        monkeypatch.setattr(firebase_service, "time", SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC))
        monkeypatch.setattr(firebase_service, "request_json", fake)
        monkeypatch.setattr(firebase_service, "_certs", {"old": "pem"})
        monkeypatch.setattr(firebase_service, "_certs_fetched_at", FROZEN_MONOTONIC - 4000)

        assert await firebase_service._load_certs() == {"new-kid": "123"}
        assert firebase_service._certs_fetched_at == FROZEN_MONOTONIC
        assert calls[0][1].endswith("securetoken@system.gserviceaccount.com")
        assert calls[0][2]["timeout"] == 8.0

    async def test_force_refreshes_fresh_certs(self, monkeypatch, firebase_state):
        fetches = []

        async def fake(*args, **kwargs):
            fetches.append(True)
            return {"rotated": "pem"}

        monkeypatch.setattr(firebase_service, "time", SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC))
        monkeypatch.setattr(firebase_service, "request_json", fake)
        monkeypatch.setattr(firebase_service, "_certs", {"old": "pem"})
        monkeypatch.setattr(firebase_service, "_certs_fetched_at", FROZEN_MONOTONIC)

        assert await firebase_service._load_certs(force=True) == {"rotated": "pem"}
        assert len(fetches) == 1

    async def test_invalid_payload_keeps_previous_certs(self, monkeypatch, firebase_state):
        async def fake(*args, **kwargs):
            return ["not", "a", "mapping"]

        monkeypatch.setattr(firebase_service, "time", SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC))
        monkeypatch.setattr(firebase_service, "request_json", fake)
        monkeypatch.setattr(firebase_service, "_certs", {"old": "pem"})
        monkeypatch.setattr(firebase_service, "_certs_fetched_at", 0.0)

        assert await firebase_service._load_certs() == {"old": "pem"}

    async def test_fetch_failure_keeps_previous_certs(self, monkeypatch, firebase_state):
        async def fake(*args, **kwargs):
            raise RuntimeError("network down")

        monkeypatch.setattr(firebase_service, "time", SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC))
        monkeypatch.setattr(firebase_service, "request_json", fake)
        monkeypatch.setattr(firebase_service, "_certs", {"old": "pem"})
        monkeypatch.setattr(firebase_service, "_certs_fetched_at", FROZEN_MONOTONIC - 4000)

        assert await firebase_service._load_certs() == {"old": "pem"}


class TestFirebaseAdmin:
    def test_unconfigured_admin_is_not_initialized(self, monkeypatch, firebase_state):
        monkeypatch.setattr(firebase_service, "get_settings", lambda: _firebase_settings(False))

        assert firebase_service.admin_initialized() is False
        assert firebase_service._admin_initialized is False

    def test_configured_admin_initializes_once_without_existing_app(self, monkeypatch, firebase_state):
        certificates = []
        initialized = []

        monkeypatch.setattr(firebase_service, "get_settings", lambda: _firebase_settings())
        monkeypatch.setattr(firebase_service.firebase_admin, "_apps", [])
        monkeypatch.setattr(firebase_service.credentials, "Certificate", lambda data: certificates.append(data) or "cert")
        monkeypatch.setattr(firebase_service.firebase_admin, "initialize_app", lambda cert, options: initialized.append((cert, options)))

        assert firebase_service.admin_initialized() is True
        assert firebase_service.admin_initialized() is True
        assert len(certificates) == 1
        assert len(initialized) == 1
        assert certificates[0]["project_id"] == "project-id"
        assert initialized[0][1] == {"projectId": "project-id"}

    def test_existing_admin_app_skips_initialization(self, monkeypatch, firebase_state):
        initialized = []

        monkeypatch.setattr(firebase_service, "get_settings", lambda: _firebase_settings())
        monkeypatch.setattr(firebase_service.firebase_admin, "_apps", ["existing"])
        monkeypatch.setattr(firebase_service.firebase_admin, "initialize_app", lambda *args: initialized.append(args))

        assert firebase_service.admin_initialized() is True
        assert initialized == []

    def test_admin_initialization_failure_returns_false(self, monkeypatch, firebase_state):
        def boom(*args, **kwargs):
            raise RuntimeError("bad key")

        monkeypatch.setattr(firebase_service, "get_settings", lambda: _firebase_settings())
        monkeypatch.setattr(firebase_service.firebase_admin, "_apps", [])
        monkeypatch.setattr(firebase_service.credentials, "Certificate", boom)

        assert firebase_service.admin_initialized() is False
        assert firebase_service._admin_initialized is False

    def test_get_firestore_without_admin_returns_none(self, monkeypatch, firebase_state):
        monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)

        assert firebase_service.get_firestore() is None

    def test_get_firestore_caches_client(self, monkeypatch, firebase_state):
        calls = []
        db = object()

        monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)
        monkeypatch.setattr(firebase_service.firestore, "client", lambda: calls.append(True) or db)

        assert firebase_service.get_firestore() is db
        assert firebase_service.get_firestore() is db
        assert len(calls) == 1

    def test_get_firestore_client_failure_returns_none(self, monkeypatch, firebase_state):
        def boom():
            raise RuntimeError("no firestore")

        monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)
        monkeypatch.setattr(firebase_service.firestore, "client", boom)

        assert firebase_service.get_firestore() is None


class TestFirebaseTokenVerification:
    async def test_admin_verification_returns_uid(self, monkeypatch, firebase_state):
        monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)
        monkeypatch.setattr(firebase_service.auth, "verify_id_token", lambda token: {"uid": "admin-uid"})

        assert await firebase_service.verify_id_token("token") == "admin-uid"

    async def test_admin_verification_failure_returns_none(self, monkeypatch, firebase_state):
        def boom(token):
            raise RuntimeError("expired")

        monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)
        monkeypatch.setattr(firebase_service.auth, "verify_id_token", boom)

        assert await firebase_service.verify_id_token("token") is None

    async def test_verify_delegates_to_public_keys_without_admin(self, monkeypatch, firebase_state):
        seen = []

        async def fake(token):
            seen.append(token)
            return "public-uid"

        monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
        monkeypatch.setattr(firebase_service, "_verify_with_public_keys", fake)

        assert await firebase_service.verify_id_token("jwt") == "public-uid"
        assert seen == ["jwt"]

    @pytest.fixture
    def public_keys(self, monkeypatch, firebase_state):
        calls = []

        async def fake_load(force=False):
            calls.append(force)
            if force:
                return {"kid": "pem"}
            return {"other": "pem"}

        monkeypatch.setattr(firebase_service, "get_settings", lambda: SimpleNamespace(firebase_project_id="project-id"))
        monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
        monkeypatch.setattr(firebase_service, "_load_certs", fake_load)
        monkeypatch.setattr(firebase_service, "_cert_to_public_key_pem", lambda pem: "PUBLIC-KEY")
        return calls

    async def test_public_keys_requires_project_id(self, monkeypatch, firebase_state):
        monkeypatch.setattr(firebase_service, "get_settings", lambda: SimpleNamespace(firebase_project_id=""))

        assert await firebase_service._verify_with_public_keys("token") is None

    async def test_public_keys_malformed_header_returns_none(self, monkeypatch, public_keys):
        def boom(token):
            raise ValueError("bad jwt")

        monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", boom)

        assert await firebase_service._verify_with_public_keys("token") is None
        assert public_keys == []

    async def test_public_keys_without_kid_returns_none(self, monkeypatch, public_keys):
        monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda token: {})

        assert await firebase_service._verify_with_public_keys("token") is None
        assert public_keys == []

    async def test_unknown_kid_forces_refresh_and_decodes(self, monkeypatch, public_keys):
        decoded = {}

        monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda token: {"kid": "kid"})
        monkeypatch.setattr(
            firebase_service.jwt,
            "decode",
            lambda token, key, **kwargs: decoded.update(key=key, **kwargs) or {"sub": "public-uid"},
        )

        assert await firebase_service._verify_with_public_keys("token") == "public-uid"
        assert public_keys == [False, True]
        assert decoded["key"] == "PUBLIC-KEY"
        assert decoded["algorithms"] == ["RS256"]
        assert decoded["audience"] == "project-id"
        assert decoded["issuer"] == "https://securetoken.google.com/project-id"

    async def test_unknown_kid_still_missing_returns_none(self, monkeypatch, firebase_state):
        monkeypatch.setattr(firebase_service, "get_settings", lambda: SimpleNamespace(firebase_project_id="project-id"))
        monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
        monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda token: {"kid": "kid"})

        async def no_certs(force=False):
            return {}

        monkeypatch.setattr(firebase_service, "_load_certs", no_certs)

        assert await firebase_service._verify_with_public_keys("token") is None

    async def test_decode_failure_returns_none(self, monkeypatch, public_keys):
        def boom(*args, **kwargs):
            raise RuntimeError("invalid signature")

        monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda token: {"kid": "kid"})
        monkeypatch.setattr(firebase_service.jwt, "decode", boom)

        assert await firebase_service._verify_with_public_keys("token") is None

    @pytest.mark.parametrize(
        "payload,expected",
        [
            ({"user_id": "primary", "sub": "second", "uid": "third"}, "primary"),
            ({"sub": "second", "uid": "third"}, "second"),
            ({"uid": "third"}, "third"),
            ({}, None),
        ],
    )
    async def test_uid_claim_precedence(self, monkeypatch, public_keys, payload, expected):
        monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda token: {"kid": "kid"})
        monkeypatch.setattr(firebase_service.jwt, "decode", lambda *args, **kwargs: payload)

        assert await firebase_service._verify_with_public_keys("token") == expected

    def test_cert_to_public_key_pem_delegates_to_x509(self, monkeypatch):
        seen = {}

        class FakePublicKey:
            def public_bytes(self, **kwargs):
                seen.update(kwargs)
                return b"PUBLIC"

        class FakeCertificate:
            def public_key(self):
                return FakePublicKey()

        def load(cert_bytes):
            seen["cert_bytes"] = cert_bytes
            return FakeCertificate()

        monkeypatch.setattr(firebase_service.x509, "load_pem_x509_certificate", load)

        assert firebase_service._cert_to_public_key_pem("pem") == "PUBLIC"
        assert seen["cert_bytes"] == b"pem"


@pytest.fixture
def rag_memory(monkeypatch):
    stores = {}
    indexes = {}
    monkeypatch.setattr(rag_service, "_memory_stores", stores)
    monkeypatch.setattr(rag_service, "_index_cache", indexes)
    monkeypatch.setattr(rag_service, "_firestore_collection", lambda: None)
    monkeypatch.setattr(rag_service, "_fs_is_writable", lambda: False)
    return stores, indexes


class _NonClosingBuffer(io.StringIO):
    def __exit__(self, *args):
        return False


class TestRagPersistence:
    def test_safe_uid_preserves_safe_ids_and_digests_unsafe_ids(self):
        assert rag_service._safe_uid("user_1-x") == "user_1-x"
        unsafe = rag_service._safe_uid("user@example.com")
        assert unsafe.startswith("user")
        assert len(unsafe.split("-")[-1]) == 12
        assert rag_service._safe_uid("user@example.com") == unsafe
        assert rag_service._safe_uid("user@example.co!") != unsafe

    def test_store_path_uses_data_dir(self, monkeypatch):
        monkeypatch.setattr(rag_service, "DATA_DIR", "/fake/data")

        assert rag_service._store_path("user_1") == rag_service.os.path.join("/fake/data", "user_1.json")

    def test_fs_is_writable_success_probe(self, monkeypatch):
        made_dirs = []
        removed = []
        writes = []

        class Probe:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def write(self, text):
                writes.append(text)

        monkeypatch.setattr(rag_service, "_filesystem_writable", None)
        monkeypatch.setattr(rag_service.os, "makedirs", lambda path, exist_ok=False: made_dirs.append(path))
        monkeypatch.setattr(builtins, "open", lambda *args, **kwargs: Probe())
        monkeypatch.setattr(rag_service.os, "remove", lambda path: removed.append(path))

        assert rag_service._fs_is_writable() is True
        assert rag_service._fs_is_writable() is True
        assert made_dirs == [rag_service.DATA_DIR]
        assert writes == ["ok"]
        assert len(removed) == 1

    def test_fs_is_writable_failure_disables_filesystem(self, monkeypatch):
        def boom(*args, **kwargs):
            raise OSError("read-only")

        monkeypatch.setattr(rag_service, "_filesystem_writable", None)
        monkeypatch.setattr(rag_service.os, "makedirs", boom)

        assert rag_service._fs_is_writable() is False
        assert rag_service._fs_is_writable() is False

    def test_firestore_collection_uses_configured_database(self, monkeypatch):
        collection = object()
        fake_db = SimpleNamespace(collection=lambda name: collection if name == "rag_documents" else None)
        monkeypatch.setattr(firebase_service, "get_firestore", lambda: fake_db)

        assert rag_service._firestore_collection() is collection

    def test_firestore_collection_failure_returns_none(self, monkeypatch):
        def boom(name):
            raise RuntimeError("no firestore")

        monkeypatch.setattr(firebase_service, "get_firestore", lambda: SimpleNamespace(collection=boom))

        assert rag_service._firestore_collection() is None

    def test_firestore_collection_without_database_returns_none(self, monkeypatch):
        monkeypatch.setattr(firebase_service, "get_firestore", lambda: None)

        assert rag_service._firestore_collection() is None

    def test_load_store_from_firestore_document(self, monkeypatch, rag_memory):
        doc = {"files": {"f1": {"fileName": "a.txt", "chunks": ["x"]}}}
        document = SimpleNamespace(get=lambda: SimpleNamespace(exists=True, to_dict=lambda: doc))
        collection = SimpleNamespace(document=lambda uid: document)
        monkeypatch.setattr(rag_service, "_firestore_collection", lambda: collection)

        assert rag_service._load_store("u") == doc

    def test_load_store_falls_back_to_memory_after_firestore_error(self, monkeypatch, rag_memory):
        stores, _ = rag_memory

        def boom():
            raise RuntimeError("read failed")

        collection = SimpleNamespace(document=lambda uid: SimpleNamespace(get=boom))
        monkeypatch.setattr(rag_service, "_firestore_collection", lambda: collection)

        assert rag_service._load_store("u") == {"files": {}}
        assert stores["u"] == {"files": {}}

    def test_load_store_reads_json_file(self, monkeypatch, rag_memory):
        stored = {"files": {"f1": {"fileName": "a.txt", "chunks": ["x"]}}}
        monkeypatch.setattr(rag_service, "_fs_is_writable", lambda: True)
        monkeypatch.setattr(rag_service.os.path, "exists", lambda path: True)
        monkeypatch.setattr(builtins, "open", lambda *args, **kwargs: io.StringIO(json.dumps(stored)))

        assert rag_service._load_store("u") == stored

    def test_load_store_corrupt_file_falls_back_to_memory(self, monkeypatch, rag_memory):
        stores, _ = rag_memory
        monkeypatch.setattr(rag_service, "_fs_is_writable", lambda: True)
        monkeypatch.setattr(rag_service.os.path, "exists", lambda path: True)
        monkeypatch.setattr(builtins, "open", lambda *args, **kwargs: io.StringIO("not json"))

        assert rag_service._load_store("u") == {"files": {}}
        assert stores["u"] == {"files": {}}

    def test_save_store_writes_firestore_first(self, monkeypatch, rag_memory):
        sets = []
        document = SimpleNamespace(set=lambda payload: sets.append(payload))
        collection = SimpleNamespace(document=lambda uid: document)
        monkeypatch.setattr(rag_service, "_firestore_collection", lambda: collection)
        monkeypatch.setattr(builtins, "open", lambda *args, **kwargs: pytest.fail("filesystem should not be used"))

        store = {"files": {"f1": {"fileName": "a.txt", "chunks": ["x"]}}}
        rag_service._save_store("u", store)

        assert sets == [{"files": store["files"]}]

    def test_save_store_falls_back_to_file_after_firestore_error(self, monkeypatch, rag_memory):
        buffer = _NonClosingBuffer()

        def boom(payload):
            raise RuntimeError("write failed")

        document = SimpleNamespace(set=boom)
        collection = SimpleNamespace(document=lambda uid: document)
        monkeypatch.setattr(rag_service, "_firestore_collection", lambda: collection)
        monkeypatch.setattr(rag_service, "_fs_is_writable", lambda: True)
        monkeypatch.setattr(builtins, "open", lambda *args, **kwargs: buffer)

        store = {"files": {"f1": {"fileName": "a.txt", "chunks": ["x"]}}}
        rag_service._save_store("u", store)

        assert json.loads(buffer.getvalue()) == store

    def test_save_store_falls_back_to_memory_when_filesystem_read_only(self, rag_memory):
        stores, _ = rag_memory
        store = {"files": {"f1": {"fileName": "a.txt", "chunks": ["x"]}}}

        rag_service._save_store("u", store)

        assert stores["u"] is store

    def test_save_store_falls_back_to_memory_after_file_write_failure(self, monkeypatch, rag_memory):
        stores, _ = rag_memory

        def boom(payload):
            raise RuntimeError("write failed")

        def fail_open(*args, **kwargs):
            raise OSError("disk full")

        document = SimpleNamespace(set=boom)
        collection = SimpleNamespace(document=lambda uid: document)
        monkeypatch.setattr(rag_service, "_firestore_collection", lambda: collection)
        monkeypatch.setattr(rag_service, "_fs_is_writable", lambda: True)
        monkeypatch.setattr(builtins, "open", fail_open)

        store = {"files": {"f1": {"fileName": "a.txt", "chunks": ["x"]}}}
        rag_service._save_store("u", store)

        assert stores["u"] is store


class TestRagIngestion:
    def test_extract_text_rejects_invalid_pdf_magic(self):
        with pytest.raises(rag_service.RagStoreError, match="not a valid PDF"):
            rag_service._extract_text("report.pdf", b"not a pdf")

    def test_extract_text_reports_missing_pdf_support(self, monkeypatch):
        monkeypatch.setattr(rag_service, "PdfReader", None)

        with pytest.raises(rag_service.RagStoreError, match="PyPDF2"):
            rag_service._extract_text("report.pdf", b"%PDF-1.4 data")

    def test_extract_text_decrypts_encrypted_pdf(self, monkeypatch):
        attempts = []

        class FakeReader:
            def __init__(self, stream):
                self.is_encrypted = True
                self.stream = stream

            def decrypt(self, password):
                attempts.append(password)

            @property
            def pages(self):
                return [SimpleNamespace(extract_text=lambda: "first"), SimpleNamespace(extract_text=lambda: None)]

        monkeypatch.setattr(rag_service, "PdfReader", FakeReader)

        assert rag_service._extract_text("report.pdf", b"%PDF-1.4 data") == "first\n"
        assert attempts == [""]

    def test_extract_text_rejects_password_protected_pdf(self, monkeypatch):
        class FakeReader:
            def __init__(self, stream):
                self.is_encrypted = True

            def decrypt(self, password):
                raise RuntimeError("wrong password")

        monkeypatch.setattr(rag_service, "PdfReader", FakeReader)

        with pytest.raises(rag_service.RagStoreError, match="password protected"):
            rag_service._extract_text("report.pdf", b"%PDF-1.4 data")

    def test_extract_text_reports_corrupt_pdf(self, monkeypatch):
        class FakeReader:
            def __init__(self, stream):
                self.is_encrypted = False

            @property
            def pages(self):
                raise RuntimeError("broken xref")

        monkeypatch.setattr(rag_service, "PdfReader", FakeReader)

        with pytest.raises(rag_service.RagStoreError, match="could not be parsed"):
            rag_service._extract_text("report.pdf", b"%PDF-1.4 data")

    def test_extract_text_repeats_csv_header_for_each_block(self):
        rows = ["h1,h2"] + [f"r{index},v{index}" for index in range(21)]
        text = rag_service._extract_text("rows.csv", "\n".join(rows).encode())

        assert text.count("h1,h2") == 2
        assert "r0,v0" in text
        assert "r20,v20" in text

    def test_extract_text_returns_empty_for_blank_csv(self):
        assert rag_service._extract_text("rows.csv", b"\n \n") == ""

    def test_extract_text_decodes_txt_with_replacement(self):
        assert rag_service._extract_text("notes.txt", b"caf\xe9") == "caf\ufffd"

    def test_chunk_text_uses_overlap_and_drops_blank_text(self, monkeypatch):
        monkeypatch.setattr(rag_service, "CHUNK_SIZE", 10)
        monkeypatch.setattr(rag_service, "CHUNK_OVERLAP", 3)

        assert rag_service._chunk_text("   \n  ") == []
        assert rag_service._chunk_text("abcdefghijklmnop") == ["abcdefghij", "hijklmnop", "op"]

    def test_process_document_indexes_txt_with_deterministic_id(self, monkeypatch, rag_memory):
        stores, indexes = rag_memory
        monkeypatch.setattr(rag_service, "time", SimpleNamespace(time=lambda: 1000.0))
        monkeypatch.setattr(rag_service, "uuid", SimpleNamespace(uuid4=lambda: SimpleNamespace(hex="abcdef")))

        result = rag_service.process_document("u", "dir/report.txt", b"hello world")

        assert result == {
            "fileId": "file-1000000-abcdef",
            "fileName": "report.txt",
            "chunkCount": 1,
            "textPreview": "hello world",
        }
        assert stores["u"]["files"]["file-1000000-abcdef"]["chunks"] == ["hello world"]
        assert indexes == {}

    def test_process_document_rejects_unknown_extension(self):
        with pytest.raises(rag_service.RagStoreError, match="Only PDF, CSV and TXT"):
            rag_service.process_document("u", "malware.exe", b"MZ")

    def test_process_document_rejects_empty_text(self):
        with pytest.raises(rag_service.RagStoreError, match="No readable text"):
            rag_service.process_document("u", "empty.txt", b"   ")

    def test_process_document_prunes_oldest_file_at_cap(self, monkeypatch, rag_memory):
        stores, _ = rag_memory
        stores["u"] = {
            "files": {
                "old": {"fileName": "old.txt", "chunks": ["old"], "createdAt": 1.0},
                "middle": {"fileName": "middle.txt", "chunks": ["middle"], "createdAt": 2.0},
            }
        }
        monkeypatch.setattr(rag_service, "MAX_FILES_PER_USER", 2)
        monkeypatch.setattr(rag_service, "time", SimpleNamespace(time=lambda: 1000.0))
        monkeypatch.setattr(rag_service, "uuid", SimpleNamespace(uuid4=lambda: SimpleNamespace(hex="abcdef")))

        rag_service.process_document("u", "new.txt", b"new text")

        assert "old" not in stores["u"]["files"]
        assert set(stores["u"]["files"]) == {"middle", "file-1000000-abcdef"}


class TestRagRetrieval:
    @pytest.fixture
    def indexed_store(self, rag_memory):
        stores, _ = rag_memory
        stores["u"] = {
            "files": {
                "alpha-file": {"fileName": "Alpha.txt", "chunks": ["alpha alpha beta"]},
                "other-file": {"fileName": "Other.txt", "chunks": ["gamma delta", "alpha"]},
                "empty-file": {"fileName": "Empty.txt", "chunks": [""]},
                "unrelated": {"fileName": "Unrelated.txt", "chunks": ["epsilon zeta"]},
            }
        }
        return stores["u"]

    def test_build_index_tracks_document_frequency(self, indexed_store):
        docs, idf, total = rag_service._build_index("u")

        assert total == 5
        assert len(docs) == 5
        assert idf["alpha"] < idf["gamma"]

    def test_get_index_is_cached_per_uid(self, monkeypatch, rag_memory):
        _, indexes = rag_memory
        calls = []
        real_build = rag_service._build_index

        def counted(uid):
            calls.append(uid)
            return real_build(uid)

        monkeypatch.setattr(rag_service, "_build_index", counted)

        first = rag_service._get_index("u")
        assert rag_service._get_index("u") is first
        assert calls == ["u"]
        assert "u" in indexes

    def test_retrieve_ranks_matching_chunks(self, indexed_store):
        results = rag_service.retrieve("u", "alpha beta", top_k=1)

        assert len(results) == 1
        assert results[0]["fileId"] == "alpha-file"
        assert results[0]["fileName"] == "Alpha.txt"
        assert results[0]["score"] > 0

    def test_retrieve_scopes_to_known_file_ids(self, indexed_store):
        results = rag_service.retrieve("u", "alpha", top_k=4, file_ids=["alpha-file", "missing"])

        assert [item["fileId"] for item in results] == ["alpha-file"]

    def test_retrieve_ignores_unknown_file_ids(self, indexed_store):
        assert rag_service.retrieve("u", "alpha", file_ids=["missing"]) == []

    def test_retrieve_skips_nonpositive_scores(self, monkeypatch):
        monkeypatch.setattr(
            rag_service,
            "_get_index",
            lambda uid: ([("f1", "F1.txt", "alpha")], {"alpha": -1.0}, 1),
        )

        assert rag_service.retrieve("u", "alpha") == []

    @pytest.mark.parametrize("query", ["", "!!!", "not-in-corpus"])
    def test_retrieve_returns_empty_for_unusable_query(self, indexed_store, query):
        assert rag_service.retrieve("u", query) == []

    def test_overview_samples_chunks_from_selected_files(self, rag_memory):
        stores, _ = rag_memory
        stores["u"] = {
            "files": {
                "selected": {"fileName": "Report.pdf", "chunks": ["c0", "c1", "c2", "c3", "c4"]},
                "missing-chunks": {"fileName": "Blank.txt", "chunks": []},
                "not-selected": {"fileName": "Other.txt", "chunks": ["other"]},
            }
        }

        results = rag_service.overview("u", ["selected", "missing-chunks", "absent"], top_k=2)

        assert [item["chunk"] for item in results] == ["c0", "c2"]
        assert all(item["fileId"] == "selected" for item in results)
        assert all(item["score"] == 0.0 for item in results)

    def test_overview_samples_all_files_when_no_filter(self, rag_memory):
        stores, _ = rag_memory
        stores["u"] = {
            "files": {
                f"f{index}": {"fileName": f"name{index}", "chunks": [f"chunk{index}"]}
                for index in range(5)
            }
        }

        results = rag_service.overview("u", None, top_k=1)

        assert [item["fileId"] for item in results] == ["f0", "f1", "f2", "f3"]

    def test_list_documents_reports_chunk_counts(self, rag_memory):
        stores, _ = rag_memory
        stores["u"] = {
            "files": {
                "f1": {"fileName": "a.txt", "chunks": ["one", "two"]},
                "f2": {"chunks": None},
            }
        }

        assert rag_service.list_documents("u") == [
            {"fileId": "f1", "fileName": "a.txt", "chunkCount": 2},
            {"fileId": "f2", "fileName": "", "chunkCount": 0},
        ]

    def test_delete_document_removes_file_and_invalidates_index(self, rag_memory):
        stores, indexes = rag_memory
        stores["u"] = {"files": {"f1": {"fileName": "a.txt", "chunks": ["one"]}}}
        indexes["u"] = ("stale", {}, 1)

        assert rag_service.delete_document("u", "f1") is True
        assert stores["u"]["files"] == {}
        assert "u" not in indexes

    def test_delete_document_unknown_id_returns_false(self, rag_memory):
        assert rag_service.delete_document("u", "missing") is False


class TestQueryRouterBranches:
    def test_blocks_for_special_intents_and_unknown_intent(self):
        assert qr.blocks_for("combined") == (
            qr.BLOCK_LOCATION,
            qr.BLOCK_AQI_NOW,
            qr.BLOCK_WEATHER_NOW,
            qr.BLOCK_WEATHER_FORECAST,
            qr.BLOCK_VULNERABILITY,
        )
        assert qr.BLOCK_DOCUMENTS in qr.blocks_for("document_context")
        assert qr.blocks_for("unknown") == qr.blocks_for("general")

    def test_document_helpers(self):
        assert qr.wants_documents("document_context") is True
        assert qr.wants_documents("weather") is False
        assert qr.wants_location("documents") is False
        assert qr.mentions_documents("see the attached report") is True
        assert qr.mentions_documents("ordinary question") is False
        assert qr.is_summary_request("key findings from the report") is True
        assert qr.is_summary_request("what is the aqi") is False

    def test_classify_combined_and_document_context(self):
        assert qr.classify("weather and air quality together") == "combined"
        assert qr.classify("compare the uploaded report with current conditions") == "document_context"

    def test_wants_historical_detects_season_phrase(self):
        assert qr.wants_historical("last winter") is True
        assert qr.wants_historical("how is the weather") is False

    def test_may_as_month_and_modal_verb(self):
        assert qr.history_window("pollution in May 2024", today=date(2026, 6, 1)) == (
            "2024-05-01",
            "2024-05-31",
            "May 2024",
        )
        assert qr.wants_historical("it may rain tomorrow") is False

    @pytest.mark.parametrize(
        "message,today,expected",
        [
            ("air in 2099", date(2026, 6, 1), ("2026-01-01", "2026-06-01", "2026 so far")),
            ("this year", date(2026, 6, 1), ("2026-01-01", "2026-06-01", "2026 so far")),
            ("November 2099", date(2026, 6, 1), ("2025-11-01", "2025-11-30", "November 2025")),
            ("June 2026", date(2026, 6, 15), ("2026-06-01", "2026-06-15", "June 2026")),
            ("last month", date(2026, 1, 15), ("2025-12-01", "2025-12-31", "December 2025")),
            ("last week", date(2026, 6, 1), ("2026-05-26", "2026-06-01", "the last 7 days")),
            ("yesterday", date(2026, 6, 1), ("2026-05-31", "2026-05-31", "yesterday")),
            ("last 900 days", date(2026, 6, 1), ("2025-06-02", "2026-06-01", "the last 365 days")),
        ],
    )
    def test_history_window_named_periods(self, message, today, expected):
        assert qr.history_window(message, today=today) == expected

    @pytest.mark.parametrize(
        "message,today,expected",
        [
            ("last winter", date(2026, 1, 15), ("2025-11-01", "2026-01-15", "winter")),
            ("last winter", date(2026, 9, 1), ("2025-11-01", "2026-02-28", "winter")),
            ("last winter", date(2026, 12, 1), ("2026-11-01", "2026-12-01", "winter")),
            ("last summer", date(2026, 6, 1), ("2026-03-01", "2026-05-31", "summer")),
            ("last summer", date(2026, 2, 1), ("2025-03-01", "2025-05-31", "summer")),
            ("last summer", date(2026, 4, 15), ("2026-03-01", "2026-04-15", "summer")),
            ("past monsoon", date(2026, 7, 1), ("2026-06-01", "2026-07-01", "monsoon")),
            ("this spring", date(2026, 6, 1), None),
        ],
    )
    def test_history_window_seasons(self, message, today, expected):
        assert qr.history_window(message, today=today) == expected

    def test_recent_days_clamps_minimum(self):
        assert qr.history_window("last 0 days", today=date(2026, 6, 1)) == (
            "2026-06-01",
            "2026-06-01",
            "the last 1 days",
        )

    def test_classify_general_fallback(self):
        assert qr.classify("tell me a random fact") == "general"

    def test_wants_historical_matches_history_terms_and_month(self):
        assert qr.wants_historical("last year") is True
        assert qr.wants_historical("November") is True

    def test_history_window_month_only_last_year_and_december(self):
        assert qr.history_window("November", today=date(2026, 6, 1)) == (
            "2025-11-01",
            "2025-11-30",
            "November 2025",
        )
        assert qr.history_window("June", today=date(2026, 6, 15)) == (
            "2026-06-01",
            "2026-06-15",
            "June 2026",
        )
        assert qr.history_window("last year", today=date(2026, 6, 1)) == (
            "2025-01-01",
            "2025-12-31",
            "2025",
        )
        assert qr.history_window("December 2025", today=date(2026, 6, 1)) == (
            "2025-12-01",
            "2025-12-31",
            "December 2025",
        )


class _FakeAsyncClient:
    def __init__(self, handler=None, closed=False):
        self.handler = handler
        self.is_closed = closed
        self.closed = False

    async def request(self, method, url, **kwargs):
        if self.handler is None:
            raise AssertionError("unexpected request")
        return await self.handler(method, url, **kwargs)

    async def aclose(self):
        self.closed = True


class TestHttpClientPooling:
    def test_build_client_uses_settings(self, monkeypatch):
        settings = SimpleNamespace(http_timeout_s=3.5, nominatim_user_agent="test-agent/1.0")
        seen = {}
        sentinel = object()

        def fake_client(**kwargs):
            seen.update(kwargs)
            return sentinel

        monkeypatch.setattr(http_client, "get_settings", lambda: settings)
        monkeypatch.setattr(http_client.httpx, "AsyncClient", fake_client)

        assert http_client._build_client() is sentinel
        assert seen["timeout"].connect == 3.5
        assert seen["timeout"].read == 3.5
        assert seen["limits"].max_connections == 40
        assert seen["limits"].max_keepalive_connections == 20
        assert seen["follow_redirects"] is True
        assert seen["headers"] == {"User-Agent": "test-agent/1.0"}

    async def test_get_client_reuses_then_rebuilds_for_a_different_loop(self, monkeypatch):
        loop = asyncio.get_running_loop()
        built = []

        def fake_build():
            built.append(_FakeAsyncClient())
            return built[-1]

        monkeypatch.setattr(http_client, "_client", None)
        monkeypatch.setattr(http_client, "_client_loop", None)
        monkeypatch.setattr(http_client, "_client_lock", None)
        monkeypatch.setattr(http_client, "_build_client", fake_build)

        first = await http_client.get_client()
        assert await http_client.get_client() is first
        assert len(built) == 1
        assert http_client._client_loop is loop

        monkeypatch.setattr(http_client, "_client_loop", object())
        rebuilt = await http_client.get_client()

        assert rebuilt is not first
        assert len(built) == 2

    async def test_get_client_rebuilds_a_closed_client(self, monkeypatch):
        built = []
        closed = _FakeAsyncClient(closed=True)

        def fake_build():
            built.append(_FakeAsyncClient())
            return built[-1]

        monkeypatch.setattr(http_client, "_client", closed)
        monkeypatch.setattr(http_client, "_client_loop", asyncio.get_running_loop())
        monkeypatch.setattr(http_client, "_client_lock", None)
        monkeypatch.setattr(http_client, "_build_client", fake_build)

        result = await http_client.get_client()

        assert result is not closed
        assert len(built) == 1

    async def test_close_client_closes_and_clears_pool(self, monkeypatch):
        client = _FakeAsyncClient()
        monkeypatch.setattr(http_client, "_client", client)
        monkeypatch.setattr(http_client, "_client_loop", object())

        await http_client.close_client()

        assert client.closed is True
        assert http_client._client is None
        assert http_client._client_loop is None

    async def test_close_client_ignores_closed_client_and_loop_errors(self, monkeypatch):
        closed = _FakeAsyncClient(closed=True)
        monkeypatch.setattr(http_client, "_client", closed)
        await http_client.close_client()
        assert closed.closed is False

        class BrokenClient(_FakeAsyncClient):
            async def aclose(self):
                raise RuntimeError("Event loop is closed")

        broken = BrokenClient()
        monkeypatch.setattr(http_client, "_client", broken)
        await http_client.close_client()
        assert http_client._client is None


class _HttpClientFixture:
    def __init__(self):
        self.sleeps = []

    def install(self, monkeypatch, handler):
        client = _FakeAsyncClient(handler)

        async def fake_get_client():
            return client

        async def fake_sleep(seconds):
            self.sleeps.append(seconds)

        monkeypatch.setattr(http_client, "get_client", fake_get_client)
        monkeypatch.setattr(http_client.asyncio, "sleep", fake_sleep)
        return client


class TestHttpRequests:
    async def test_transport_failure_exhausts_retries(self, monkeypatch):
        attempts = []

        async def handler(method, url, **kwargs):
            attempts.append(method)
            raise httpx.TimeoutException("timed out")

        fixture = _HttpClientFixture()
        fixture.install(monkeypatch, handler)

        with pytest.raises(ProviderError) as exc:
            await http_client.request_json("GET", "http://provider.invalid/x", provider="weather", retries=1)

        assert exc.value.provider == "weather"
        assert exc.value.status is None
        assert str(exc.value) == "weather unreachable"
        assert len(attempts) == 2
        assert fixture.sleeps == [2.0]

    async def test_transport_failure_recovers_on_second_attempt(self, monkeypatch):
        attempts = []

        async def handler(method, url, **kwargs):
            attempts.append(True)
            if len(attempts) == 1:
                raise httpx.TransportError("connection reset")
            return httpx.Response(200, json={"ok": True})

        fixture = _HttpClientFixture()
        fixture.install(monkeypatch, handler)

        assert await http_client.request_json("GET", "http://provider.invalid/x", provider="weather", retries=1) == {"ok": True}
        assert len(attempts) == 2
        assert fixture.sleeps == [2.0]

    async def test_malformed_json_raises_provider_error(self, monkeypatch):
        async def handler(method, url, **kwargs):
            return httpx.Response(200, text="not-json")

        fixture = _HttpClientFixture()
        fixture.install(monkeypatch, handler)

        with pytest.raises(ProviderError) as exc:
            await http_client.request_json("GET", "http://provider.invalid/x", provider="weather")

        assert exc.value.status == 200
        assert str(exc.value) == "weather returned malformed JSON"
        assert fixture.sleeps == []

    async def test_permanent_http_error_is_not_retried(self, monkeypatch):
        attempts = []

        async def handler(method, url, **kwargs):
            attempts.append(method)
            return httpx.Response(400, text="bad request")

        fixture = _HttpClientFixture()
        fixture.install(monkeypatch, handler)

        with pytest.raises(ProviderError) as exc:
            await http_client.request_json("GET", "http://provider.invalid/x", provider="weather", retries=3)

        assert exc.value.status == 400
        assert str(exc.value) == "weather returned HTTP 400"
        assert len(attempts) == 1
        assert fixture.sleeps == []

    async def test_retry_after_header_controls_backoff(self, monkeypatch):
        attempts = []

        async def handler(method, url, **kwargs):
            attempts.append(True)
            if len(attempts) == 1:
                return httpx.Response(503, headers={"Retry-After": "3.5"})
            return httpx.Response(200, json={"ok": True})

        fixture = _HttpClientFixture()
        fixture.install(monkeypatch, handler)

        assert await http_client.request_json("GET", "http://provider.invalid/x", provider="air", retries=1) == {"ok": True}
        assert fixture.sleeps == [3.5]

    async def test_default_backoff_is_used_without_retry_after(self, monkeypatch):
        attempts = []

        async def handler(method, url, **kwargs):
            attempts.append(True)
            if len(attempts) == 1:
                return httpx.Response(429)
            return httpx.Response(200, json={"ok": True})

        fixture = _HttpClientFixture()
        fixture.install(monkeypatch, handler)

        await http_client.request_json("GET", "http://provider.invalid/x", provider="air", retries=1)

        assert fixture.sleeps == [2.0]

    async def test_nonpositive_retries_skips_request_and_reports_unreachable(self, monkeypatch):
        async def handler(method, url, **kwargs):
            raise AssertionError("no request should be made")

        _HttpClientFixture().install(monkeypatch, handler)

        with pytest.raises(ProviderError) as exc:
            await http_client.request_json("GET", "http://provider.invalid/x", provider="llm", retries=-1)

        assert str(exc.value) == "llm unreachable"
        assert exc.value.status is None

    @pytest.mark.parametrize(
        "header,expected",
        [("2.5", 2.5), ("99", 15.0), ("-3", 0.0), ("bad", None), (None, None)],
    )
    def test_retry_after_seconds_parses_and_clamps(self, header, expected):
        headers = {} if header is None else {"Retry-After": header}
        response = httpx.Response(200, headers=headers)

        assert http_client._retry_after_seconds(response) == expected


class TestSecurity:
    @pytest.fixture
    def settings(self, monkeypatch):
        current = SimpleNamespace(allow_dev_auth=True, environment="test")
        monkeypatch.setattr(security, "get_settings", lambda: current)
        return current

    @pytest.mark.parametrize(
        "header,message",
        [
            ("", "Missing authentication token"),
            ("bearer ", "Missing authentication token"),
            ("Basic dev:x", "Missing authentication token"),
            ("Bearer dev:  ", "Malformed authentication token"),
        ],
    )
    async def test_malformed_tokens_are_rejected(self, monkeypatch, settings, header, message):
        request = _request(headers=[(b"authorization", header.encode())])

        with pytest.raises(Exception) as exc:
            await security.get_uid(request)

        assert exc.value.message == message

    async def test_dev_token_disabled_is_rejected(self, monkeypatch, settings):
        settings.allow_dev_auth = False
        settings.environment = "production"
        request = _request(headers=[(b"authorization", b"Bearer dev:someone")])

        with pytest.raises(Exception) as exc:
            await security.get_uid(request)

        assert exc.value.message == "Invalid or expired token"
        assert exc.value.status_code == 401

    async def test_dev_token_success_sets_request_state(self, settings):
        request = _request(headers=[(b"authorization", b"Bearer dev:alice")])

        assert await security.get_uid(request) == "alice"
        assert request.state.uid == "alice"

    async def test_firebase_token_success_sets_request_state(self, monkeypatch, settings):
        seen = []

        async def fake(token):
            seen.append(token)
            return "firebase-uid"

        monkeypatch.setattr(firebase_service, "verify_id_token", fake)
        request = _request(headers=[(b"authorization", b"Bearer real-jwt")])

        assert await security.get_uid(request) == "firebase-uid"
        assert seen == ["real-jwt"]
        assert request.state.uid == "firebase-uid"

    async def test_firebase_token_failure_is_rejected(self, monkeypatch, settings):
        async def fake(token):
            return None

        monkeypatch.setattr(firebase_service, "verify_id_token", fake)
        request = _request(headers=[(b"authorization", b"Bearer invalid-jwt")])

        with pytest.raises(Exception) as exc:
            await security.get_uid(request)

        assert exc.value.message == "Invalid or expired token"


class TestMiddlewareInternals:
    def test_fixed_window_counter_counts_retries_and_resets(self, monkeypatch):
        now = [FROZEN_MONOTONIC]
        monkeypatch.setattr(middleware, "time", SimpleNamespace(monotonic=lambda: now[0], perf_counter=lambda: 0.0))
        counter = middleware._FixedWindowCounter()

        assert counter.hit("ip:1.2.3.4:/api/aqi:2", 2, 60) == (True, 0)
        assert counter.hit("ip:1.2.3.4:/api/aqi:2", 2, 60) == (True, 0)
        assert counter.hit("ip:1.2.3.4:/api/aqi:2", 2, 60) == (False, 61)

        now[0] += 61
        assert counter.hit("ip:1.2.3.4:/api/aqi:2", 2, 60) == (True, 0)

        counter.reset()
        assert counter._hits == {}

    def test_fixed_window_counter_prunes_empty_buckets(self, monkeypatch):
        now = [FROZEN_MONOTONIC]
        monkeypatch.setattr(middleware, "time", SimpleNamespace(monotonic=lambda: now[0], perf_counter=lambda: 0.0))
        counter = middleware._FixedWindowCounter()
        counter.hit("stale", 1, 1)
        counter._hits["stale"].clear()
        counter._calls = 255

        now[0] += 10
        assert counter.hit("fresh", 1, 60) == (True, 0)
        assert "stale" not in counter._hits
        assert "fresh" in counter._hits

    async def test_identity_prefers_verified_uid(self, monkeypatch):
        async def fake(request):
            assert request.headers["Authorization"] == "Bearer jwt"
            return "verified"

        monkeypatch.setattr(security, "get_uid", fake)
        request = _request(headers=[(b"authorization", b"Bearer jwt")])

        assert await middleware._identity(request) == "uid:verified"

    async def test_identity_falls_back_to_peer_on_auth_error(self, monkeypatch):
        async def fake(token):
            raise RuntimeError("bad token")

        monkeypatch.setattr(security, "get_uid", fake)
        request = _request(headers=[(b"authorization", b"Bearer bad")])

        assert await middleware._identity(request) == "ip:1.2.3.4"

    async def test_identity_uses_state_uid_and_ignores_forwarded_header(self):
        request = _request(
            headers=[(b"x-forwarded-for", b"9.9.9.9")],
            state={"uid": "already-verified"},
        )

        assert await middleware._identity(request) == "uid:already-verified"

    async def test_identity_without_client_uses_unknown(self):
        request = _request(client=None)

        assert await middleware._identity(request) == "ip:unknown"


class TestRateLimitMiddleware:
    @pytest.fixture
    def dispatch_env(self, monkeypatch):
        monkeypatch.setattr(middleware, "time", SimpleNamespace(monotonic=lambda: FROZEN_MONOTONIC, perf_counter=lambda: 0.0))
        monkeypatch.setattr(middleware, "_counters", middleware._FixedWindowCounter())

        async def fake_identity(request):
            return "uid:test-user"

        monkeypatch.setattr(middleware, "_identity", fake_identity)
        settings = SimpleNamespace(
            rate_limit_enabled=True,
            rate_limit_requests=2,
            rate_limit_window_s=60,
            rate_limit_chat_requests=4,
            rate_limit_chat_window_s=300,
        )
        monkeypatch.setattr(middleware, "get_settings", lambda: settings)
        return middleware.RateLimitMiddleware(app=lambda scope, receive, send: None)

    @staticmethod
    async def _call_next(request):
        from fastapi.responses import Response

        return Response("ok")

    @staticmethod
    def _request(method="GET", path="/api/aqi"):
        return _request(headers=[], state={}).__class__({
            "type": "http",
            "method": method,
            "path": path,
            "headers": [],
            "query_string": b"",
            "scheme": "http",
            "server": ("test", 80),
            "client": ("1.2.3.4", 1234),
            "state": {},
        })

    async def test_rate_limit_bypass_for_disabled_non_api_and_options(self, monkeypatch, dispatch_env):
        monkeypatch.setattr(middleware, "get_settings", lambda: SimpleNamespace(rate_limit_enabled=False))

        for method, path in (("GET", "/api/aqi"), ("GET", "/health"), ("OPTIONS", "/api/ai/chat")):
            response = await dispatch_env.dispatch(self._request(method, path), self._call_next)
            assert response.status_code == 200
            assert "X-RateLimit-Limit" not in response.headers

    async def test_rate_limit_adds_limit_headers(self, dispatch_env):
        response = await dispatch_env.dispatch(self._request(path="/api/aqi"), self._call_next)

        assert response.status_code == 200
        assert response.headers["X-RateLimit-Limit"] == "2"
        assert response.headers["X-RateLimit-Window"] == "60"

    async def test_costly_path_uses_chat_budget(self, dispatch_env):
        response = await dispatch_env.dispatch(self._request("POST", "/api/ai/chat"), self._call_next)

        assert response.headers["X-RateLimit-Limit"] == "4"
        assert response.headers["X-RateLimit-Window"] == "300"

    async def test_blocked_request_returns_retry_after(self, dispatch_env):
        monkeypatch_limit = middleware._counters
        monkeypatch_limit.hit("uid:test-user:/api/aqi:2", 2, 60)
        monkeypatch_limit.hit("uid:test-user:/api/aqi:2", 2, 60)

        response = await dispatch_env.dispatch(self._request(path="/api/aqi"), self._call_next)

        assert response.status_code == 429
        assert response.headers["Retry-After"] == "61"
        assert b"Too many requests" in response.body


class TestTimingMiddleware:
    @staticmethod
    async def _call_next(request):
        from fastapi.responses import Response

        return Response("ok")

    @staticmethod
    def _request(path):
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": path,
                "headers": [],
                "query_string": b"",
                "scheme": "http",
                "server": ("test", 80),
                "client": ("1.2.3.4", 1234),
                "state": {},
            }
        )

    @pytest.mark.parametrize("path", ["/api/aqi", "/health"])
    async def test_adds_response_time_header(self, monkeypatch, path):
        ticks = iter([1.0, 1.25])
        monkeypatch.setattr(
            middleware,
            "time",
            SimpleNamespace(monotonic=lambda: 0.0, perf_counter=lambda: next(ticks)),
        )
        instance = middleware.TimingMiddleware(app=lambda scope, receive, send: None)

        response = await instance.dispatch(self._request(path), self._call_next)

        assert response.status_code == 200
        assert response.headers["X-Response-Time-Ms"] == "250"

