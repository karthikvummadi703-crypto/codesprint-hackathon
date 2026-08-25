from fastapi import HTTPException, Request

from . import firebase_service

DEV_TOKEN_PREFIX = "dev:"


def get_uid(request: Request) -> str:
    """Resolve the authenticated user's UID from the Authorization header.

    Real Firebase ID tokens are verified with the Admin SDK. When the Admin
    SDK is not configured (local dev), a `dev:<uid>` token is accepted as a
    clearly-labeled mock authentication path.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = auth_header[len("Bearer "):].strip()

    if token.startswith(DEV_TOKEN_PREFIX):
        uid = token[len(DEV_TOKEN_PREFIX):].strip()
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid dev token")
        return uid

    uid = firebase_service.verify_id_token(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid
