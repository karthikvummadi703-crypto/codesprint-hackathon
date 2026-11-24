"""Additional Firebase Admin and public-key verification branches."""

from __future__ import annotations

import time

import anyio
import pytest

from config import Settings
from services import firebase_service


class _FakeCertificate:
    def __init__(self, data: dict[str, str]) -> None:
        self.data = data


@pytest.fixture
def firebase_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(firebase_service, "_certs", {})
    monkeypatch.setattr(firebase_service, "_certs_fetched_at", 0.0)
    monkeypatch.setattr(firebase_service, "_admin_initialized", False)
    monkeypatch.setattr(firebase_service, "_firestore_client", None)


def configure_firebase(monkeypatch: pytest.MonkeyPatch, *, configured: bool) -> None:
    settings = Settings(
        firebase_project_id="sample-project" if configured else "",
        firebase_client_email="service@sample-project.test" if configured else "",
        firebase_private_key="sample-private-key" if configured else "",
    )
    monkeypatch.setattr(firebase_service, "get_settings", lambda: settings)


async def test_cached_certificates_are_reused_without_a_request(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_certs", {"kid": "pem"})
    monkeypatch.setattr(firebase_service, "_certs_fetched_at", time.monotonic())

    async def unexpected(*args: object, **kwargs: object) -> dict[str, str]:
        raise AssertionError("certificates were fetched unnecessarily")

    monkeypatch.setattr(firebase_service, "request_json", unexpected)
    assert await firebase_service._load_certs() == {"kid": "pem"}


async def test_certificates_are_fetched_and_stringified(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    seen: list[str] = []

    async def fake_request(method: str, url: str, **kwargs: object) -> dict[object, object]:
        seen.append(str(kwargs["provider"]))
        assert method == "GET"
        assert url.endswith("securetoken@system.gserviceaccount.com")
        assert kwargs["timeout"] == 8.0
        return {"kid": "pem", 7: 42}

    monkeypatch.setattr(firebase_service, "request_json", fake_request)
    assert await firebase_service._load_certs() == {"kid": "pem", "7": "42"}
    assert seen == ["google-certs"]


async def test_failed_or_unexpected_certificate_refresh_keeps_the_old_set(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_certs", {"old": "pem"})
    monkeypatch.setattr(firebase_service, "_certs_fetched_at", time.monotonic())

    async def failing(*args: object, **kwargs: object) -> dict[str, str]:
        raise RuntimeError("network is down")

    monkeypatch.setattr(firebase_service, "request_json", failing)
    assert await firebase_service._load_certs(force=True) == {"old": "pem"}

    async def unexpected_shape(*args: object, **kwargs: object) -> object:
        return ["not", "a", "mapping"]

    monkeypatch.setattr(firebase_service, "request_json", unexpected_shape)
    assert await firebase_service._load_certs(force=True) == {"old": "pem"}


def test_admin_sdk_is_skipped_without_configuration(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    configure_firebase(monkeypatch, configured=False)

    def unexpected(*args: object, **kwargs: object) -> object:
        raise AssertionError("Admin SDK must not initialize without credentials")

    monkeypatch.setattr(firebase_service.credentials, "Certificate", unexpected)
    assert firebase_service.admin_initialized() is False


def test_admin_sdk_initializes_once_and_reuses_the_flag(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service.firebase_admin, "_apps", [])
    certificates: list[_FakeCertificate] = []
    options: list[dict[str, str]] = []

    def make_certificate(data: dict[str, str]) -> _FakeCertificate:
        certificate = _FakeCertificate(data)
        certificates.append(certificate)
        return certificate

    def initialize(certificate: object, settings: dict[str, str]) -> str:
        assert isinstance(certificate, _FakeCertificate)
        options.append(settings)
        return "initialized-app"

    monkeypatch.setattr(firebase_service.credentials, "Certificate", make_certificate)
    monkeypatch.setattr(firebase_service.firebase_admin, "initialize_app", initialize)
    assert firebase_service._init_admin() is True
    assert firebase_service._init_admin() is True
    assert len(certificates) == 1
    assert options == [{"projectId": "sample-project"}]
    assert certificates[0].data["project_id"] == "sample-project"
    assert "oauth2.googleapis.com" in str(certificates[0].data)


def test_initialization_failure_is_reported_without_poisoning_the_flag(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service.firebase_admin, "_apps", [])
    monkeypatch.setattr(firebase_service.credentials, "Certificate", lambda data: _FakeCertificate(data))

    def failing_initialize(*args: object, **kwargs: object) -> str:
        raise RuntimeError("bad credentials")

    monkeypatch.setattr(firebase_service.firebase_admin, "initialize_app", failing_initialize)
    assert firebase_service._init_admin() is False
    assert firebase_service._admin_initialized is False


def test_existing_default_app_is_reused(monkeypatch: pytest.MonkeyPatch, firebase_state: None) -> None:
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service.firebase_admin, "_apps", ["existing-app"])

    def unexpected(*args: object, **kwargs: object) -> object:
        raise AssertionError("an existing app must not be replaced")

    monkeypatch.setattr(firebase_service.credentials, "Certificate", unexpected)
    monkeypatch.setattr(firebase_service.firebase_admin, "initialize_app", unexpected)
    assert firebase_service._init_admin() is True


def test_firestore_client_is_created_once_or_reported_unavailable(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
    assert firebase_service.get_firestore() is None

    monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)
    calls: list[str] = []

    def make_client() -> str:
        calls.append("client")
        return "firestore-client"

    monkeypatch.setattr(firebase_service.firestore, "client", make_client)
    assert firebase_service.get_firestore() == "firestore-client"
    assert firebase_service.get_firestore() == "firestore-client"
    assert calls == ["client"]

    def failing_client() -> str:
        raise RuntimeError("no access")

    monkeypatch.setattr(firebase_service, "_firestore_client", None)
    monkeypatch.setattr(firebase_service.firestore, "client", failing_client)
    assert firebase_service.get_firestore() is None


def test_admin_verification_returns_the_uid(monkeypatch: pytest.MonkeyPatch, firebase_state: None) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)
    seen: list[str] = []

    def verify(raw: str) -> dict[str, str]:
        seen.append(raw)
        return {"uid": "verified-user"}

    monkeypatch.setattr(firebase_service.auth, "verify_id_token", verify)
    assert anyio.run(firebase_service.verify_id_token, "raw-token") == "verified-user"
    assert seen == ["raw-token"]


@pytest.mark.parametrize("decoded", [{}, None])
def test_admin_verification_without_a_uid_is_rejected(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None, decoded: dict[str, str] | None
) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)

    def verify(raw: str) -> dict[str, str] | None:
        assert raw
        return decoded

    monkeypatch.setattr(firebase_service.auth, "verify_id_token", verify)
    assert anyio.run(firebase_service.verify_id_token, "raw-token") is None


def test_admin_verification_errors_are_swallowed(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: True)

    def verify(raw: str) -> dict[str, str]:
        raise RuntimeError("expired")

    monkeypatch.setattr(firebase_service.auth, "verify_id_token", verify)
    assert anyio.run(firebase_service.verify_id_token, "raw-token") is None


def test_public_verification_needs_a_project_id(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
    configure_firebase(monkeypatch, configured=False)
    assert anyio.run(firebase_service.verify_id_token, "raw-token") is None


def test_public_verification_rejects_an_unreadable_header(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
    configure_firebase(monkeypatch, configured=True)

    def broken_header(raw: str) -> dict[str, str]:
        raise ValueError("not a jwt")

    monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", broken_header)
    assert anyio.run(firebase_service.verify_id_token, "raw-token") is None


def test_public_verification_rejects_a_token_without_a_kid(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    monkeypatch.setattr(firebase_service, "_init_admin", lambda: False)
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda raw: {"alg": "RS256"})
    assert anyio.run(firebase_service.verify_id_token, "raw-token") is None


async def test_unknown_kid_forces_one_certificate_refresh(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service, "_certs", {"old": "pem"})
    monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda raw: {"kid": "fresh"})
    monkeypatch.setattr(firebase_service, "_cert_to_public_key_pem", lambda pem: "PUBLIC-KEY")
    flags: list[bool] = []

    async def load_certs(force: bool = False) -> dict[str, str]:
        flags.append(force)
        return {"fresh": "pem"} if force else {"old": "pem"}

    def decode(raw: str, key: str, *, algorithms: list[str], audience: str, issuer: str) -> dict[str, str]:
        assert raw == "raw-token"
        assert key == "PUBLIC-KEY"
        assert algorithms == ["RS256"]
        assert audience == "sample-project"
        assert issuer == "https://securetoken.google.com/sample-project"
        return {"user_id": "public-user"}

    monkeypatch.setattr(firebase_service, "_load_certs", load_certs)
    monkeypatch.setattr(firebase_service.jwt, "decode", decode)
    assert await firebase_service._verify_with_public_keys("raw-token") == "public-user"
    assert flags == [False, True]


@pytest.mark.parametrize(
    ("payload", "expected"),
    [({"sub": "subject-user"}, "subject-user"), ({"uid": "uid-user"}, "uid-user")],
)
async def test_public_verification_accepts_subject_and_uid_claims(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None, payload: dict[str, str], expected: str
) -> None:
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda raw: {"kid": "known"})
    monkeypatch.setattr(firebase_service, "_cert_to_public_key_pem", lambda pem: "PUBLIC-KEY")

    async def load_certs(force: bool = False) -> dict[str, str]:
        assert force is False
        return {"known": "pem"}

    monkeypatch.setattr(firebase_service, "_load_certs", load_certs)
    monkeypatch.setattr(firebase_service.jwt, "decode", lambda *args, **kwargs: payload)
    assert await firebase_service._verify_with_public_keys("raw-token") == expected


async def test_public_verification_rejects_unusable_certificates_and_decode_errors(
    monkeypatch: pytest.MonkeyPatch, firebase_state: None
) -> None:
    configure_firebase(monkeypatch, configured=True)
    monkeypatch.setattr(firebase_service.jwt, "get_unverified_header", lambda raw: {"kid": "known"})

    async def load_certs(force: bool = False) -> dict[str, str]:
        return {"known": "pem"}

    monkeypatch.setattr(firebase_service, "_load_certs", load_certs)

    def bad_certificate(pem: str) -> str:
        raise ValueError("invalid certificate")

    monkeypatch.setattr(firebase_service, "_cert_to_public_key_pem", bad_certificate)
    assert await firebase_service._verify_with_public_keys("raw-token") is None

    monkeypatch.setattr(firebase_service, "_cert_to_public_key_pem", lambda pem: "PUBLIC-KEY")

    def bad_decode(*args: object, **kwargs: object) -> dict[str, str]:
        raise RuntimeError("signature mismatch")

    monkeypatch.setattr(firebase_service.jwt, "decode", bad_decode)
    assert await firebase_service._verify_with_public_keys("raw-token") is None


def test_certificate_conversion_rejects_invalid_pem() -> None:
    with pytest.raises(ValueError, match="Unable to load PEM file"):
        firebase_service._cert_to_public_key_pem("not a certificate")
