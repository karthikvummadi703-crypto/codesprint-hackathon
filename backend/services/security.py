"""Request authentication.

The backend accepts two token forms:

* A Firebase ID token, verified against a service account when one is configured
  and otherwise against Google's published signing certificates.
* A `dev:<uid>` token, which is a *local development* convenience only. It is
  refused outright unless `ALLOW_DEV_AUTH` is enabled, and the default is derived
  from `ENVIRONMENT` so a production deployment cannot enable it by omission.

A production deployment with no Firebase configuration rejects every request
rather than silently accepting a forged uid, because RAG documents are namespaced
by uid and a forgeable uid would expose another user's uploads.
"""

from __future__ import annotations

from fastapi import Request

from config import get_settings
from errors import AuthenticationError
from logging_config import get_logger
from services import firebase_service

log = get_logger("airguard.auth")

DEV_TOKEN_PREFIX = "dev:"
BEARER_PREFIX = "bearer "


async def get_uid(request: Request) -> str:
    """Resolve the caller's uid, or raise AuthenticationError.

    Stored on `request.state.uid` so middleware and logging can use it.
    """
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith(BEARER_PREFIX):
        raise AuthenticationError("Missing authentication token")

    token = header[len(BEARER_PREFIX):].strip()
    if not token:
        raise AuthenticationError("Missing authentication token")

    if token.startswith(DEV_TOKEN_PREFIX):
        uid = token[len(DEV_TOKEN_PREFIX):].strip()
        if not uid:
            raise AuthenticationError("Malformed authentication token")
        settings = get_settings()
        if not settings.allow_dev_auth:
            log.warning("rejected dev-token auth in %s", settings.environment)
            raise AuthenticationError("Invalid or expired token")
        request.state.uid = uid
        return uid

    # `verify_id_token` is async because it may have to fetch Google's signing
    # certificates. It must be awaited: an un-awaited coroutine object is truthy,
    # so a missing `await` here would silently hand the caller a coroutine as if
    # it were a verified uid.
    uid = await firebase_service.verify_id_token(token)
    if not uid:
        raise AuthenticationError("Invalid or expired token")
    request.state.uid = uid
    return uid
