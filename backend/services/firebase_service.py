"""Firebase token verification and optional Admin SDK access.

Two verification paths, so the backend needs no service account in order to
validate real Firebase ID tokens:

1. Admin SDK, when FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY are set.
2. Direct RS256 verification against Google's published x509 certificates.

Public certificates are cached in memory and refreshed when the provider rotates
a key or a token arrives with an unknown `kid`.
"""

from __future__ import annotations

import time

import firebase_admin
import jwt
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from firebase_admin import auth, credentials, firestore

from config import get_settings
from http_client import request_json
from logging_config import get_logger

log = get_logger("airguard.firebase")

_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_CERTS_TTL_S = 3600

_certs: dict[str, str] = {}
_certs_fetched_at: float = 0.0
_admin_initialized = False
_firestore_client = None


async def _load_certs(force: bool = False) -> dict[str, str]:
    global _certs, _certs_fetched_at
    now = time.monotonic()
    if _certs and not force and (now - _certs_fetched_at) < _CERTS_TTL_S:
        return _certs
    try:
        data = await request_json("GET", _CERTS_URL, provider="google-certs", timeout=8.0)
        if isinstance(data, dict) and data:
            _certs = {str(k): str(v) for k, v in data.items()}
            _certs_fetched_at = now
    except Exception as exc:
        log.warning("could not refresh Firebase signing certificates: %s", type(exc).__name__)
    return _certs


def _init_admin() -> bool:
    """Initialize the Admin SDK once, if a service account is configured."""
    global _admin_initialized
    settings = get_settings()
    if not settings.firebase_admin_configured:
        return False
    if _admin_initialized:
        return True
    try:
        if not firebase_admin._apps:
            cert = credentials.Certificate(
                {
                    "type": "service_account",
                    "project_id": settings.firebase_project_id,
                    "client_email": settings.firebase_client_email,
                    "private_key": settings.firebase_private_key,
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            )
            firebase_admin.initialize_app(cert, {"projectId": settings.firebase_project_id})
        _admin_initialized = True
        return True
    except Exception as exc:
        log.error("Firebase Admin initialization failed: %s", type(exc).__name__)
        return False


def admin_initialized() -> bool:
    return _init_admin()


def get_firestore():
    """Firestore client, or None when the Admin SDK is not configured."""
    global _firestore_client
    if not _init_admin():
        return None
    if _firestore_client is None:
        try:
            _firestore_client = firestore.client()
        except Exception as exc:
            log.error("Firestore client unavailable: %s", type(exc).__name__)
            return None
    return _firestore_client


async def verify_id_token(token: str) -> str | None:
    """Verify a Firebase ID token and return its uid, or None when invalid."""
    if _init_admin():
        import anyio

        def _verify() -> str | None:
            try:
                decoded = auth.verify_id_token(token)
                return decoded.get("uid")
            except Exception:
                return None

        return await anyio.to_thread.run_sync(_verify)

    return await _verify_with_public_keys(token)


async def _verify_with_public_keys(token: str) -> str | None:
    project_id = get_settings().firebase_project_id
    if not project_id:
        return None
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        return None
    kid = header.get("kid")
    if not kid:
        return None

    certs = await _load_certs()
    cert_pem = certs.get(kid)
    if cert_pem is None:
        # Unknown kid means Google rotated its keys; refresh once and retry.
        certs = await _load_certs(force=True)
        cert_pem = certs.get(kid)
    if not cert_pem:
        return None

    try:
        public_key = _cert_to_public_key_pem(cert_pem)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
        )
    except Exception:
        return None

    return payload.get("user_id") or payload.get("sub") or payload.get("uid")


def _cert_to_public_key_pem(cert_pem: str) -> str:
    cert = x509.load_pem_x509_certificate(cert_pem.encode())
    public_key = cert.public_key()
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
