import os
import time

import firebase_admin
import httpx
import jwt
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from firebase_admin import credentials, auth, firestore

_config = None
_firestore_client = None

# Google public signing certs for Firebase ID tokens (no service account needed).
_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_certs_cache = {"certs": None, "expires_at": 0}


def _load_config():
    global _config
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")
    if project_id and client_email and private_key:
        _config = {
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key.replace("\\n", "\n"),
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    return _config


def _init_admin():
    global _config, _firestore_client
    if not _config:
        _load_config()
    if _config and not firebase_admin._apps:
        cred = credentials.Certificate(_config)
        firebase_admin.initialize_app(cred, {"projectId": _config["project_id"]})


def admin_initialized() -> bool:
    _load_config()
    return _config is not None


def get_firestore():
    global _firestore_client
    if not admin_initialized():
        return None
    _init_admin()
    if _firestore_client is None:
        _firestore_client = firestore.client()
    return _firestore_client


def verify_id_token(token: str):
    """Verify a Firebase ID token. Returns uid string or None if invalid.

    Uses the Admin SDK when a service account is configured; otherwise verifies
    the JWT signature against Google's public signing certificates directly.
    """
    if admin_initialized():
        _init_admin()
        try:
            decoded = auth.verify_id_token(token)
            return decoded.get("uid")
        except Exception:
            return None

    return _verify_with_public_keys(token)


def _verify_with_public_keys(token: str):
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if not project_id:
        return None
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            return None
        certs = _fetch_public_certs()
        cert = certs.get(kid)
        if not cert:
            return None
        public_key = _cert_to_public_key_pem(cert)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
        )
        return payload.get("user_id") or payload.get("sub") or payload.get("uid")
    except Exception:
        return None


def _cert_to_public_key_pem(cert_pem: str) -> str:
    cert = x509.load_pem_x509_certificate(cert_pem.encode())
    pub = cert.public_key()
    return pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


def _fetch_public_certs() -> dict:
    if _certs_cache["certs"] and _certs_cache["expires_at"] > time.time():
        return _certs_cache["certs"]
    try:
        r = httpx.get(_CERTS_URL, timeout=10)
        r.raise_for_status()
        certs = r.json()
        _certs_cache["certs"] = certs
        _certs_cache["expires_at"] = time.time() + 3600
        return certs
    except Exception:
        return _certs_cache["certs"] or {}
