"""Service-level authentication branches for the uid resolver."""

from __future__ import annotations

import anyio
import pytest
from fastapi import Request
from starlette.types import Scope

from config import Settings
from errors import AuthenticationError
from services import firebase_service, security


def make_request(header: str | None = None) -> Request:
    scope: Scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [] if header is None else [(b"authorization", header.encode("utf-8"))],
    }
    return Request(scope)


def configure_dev_auth(monkeypatch: pytest.MonkeyPatch, *, allowed: bool) -> None:
    settings = Settings(allow_dev_auth=allowed, environment="test" if allowed else "production")
    monkeypatch.setattr(security, "get_settings", lambda: settings)


@pytest.mark.parametrize("header", [None, "Basic dev:user", "Bearer", "Bearer   "])
def test_missing_or_unusable_authorization_header_is_rejected(header: str | None) -> None:
    with pytest.raises(AuthenticationError, match="Missing authentication token"):
        anyio.run(security.get_uid, make_request(header))


def test_dev_token_is_case_insensitive_and_stored_on_request_state(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_dev_auth(monkeypatch, allowed=True)
    request = make_request("bearer   dev: local-user  ")
    assert anyio.run(security.get_uid, request) == "local-user"
    assert request.state.uid == "local-user"


def test_empty_dev_uid_is_rejected_as_malformed(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_dev_auth(monkeypatch, allowed=True)
    with pytest.raises(AuthenticationError, match="Malformed authentication token"):
        anyio.run(security.get_uid, make_request("Bearer dev:   "))


def test_dev_token_is_rejected_when_explicitly_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_dev_auth(monkeypatch, allowed=False)
    with pytest.raises(AuthenticationError, match="Invalid or expired token"):
        anyio.run(security.get_uid, make_request("Bearer dev:local-user"))


def test_verified_firebase_uid_is_stored_on_request_state(monkeypatch: pytest.MonkeyPatch) -> None:
    async def verify(raw: str) -> str:
        assert raw == "id-token"
        return "firebase-user"

    monkeypatch.setattr(firebase_service, "verify_id_token", verify)
    request = make_request("Bearer id-token")
    assert anyio.run(security.get_uid, request) == "firebase-user"
    assert request.state.uid == "firebase-user"


def test_failed_firebase_verification_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    async def verify(raw: str) -> None:
        assert raw
        return None

    monkeypatch.setattr(firebase_service, "verify_id_token", verify)
    with pytest.raises(AuthenticationError, match="Invalid or expired token"):
        anyio.run(security.get_uid, make_request("Bearer id-token"))


def test_firebase_tokens_still_work_while_dev_tokens_are_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_dev_auth(monkeypatch, allowed=False)

    async def verify(raw: str) -> str:
        assert raw
        return "real-user"

    monkeypatch.setattr(firebase_service, "verify_id_token", verify)
    assert anyio.run(security.get_uid, make_request("Bearer id-token")) == "real-user"
