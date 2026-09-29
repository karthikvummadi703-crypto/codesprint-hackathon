"""Vercel serverless entrypoint for the AirGuard AI backend.

Vercel maps every file in `api/` to its own function, so mounting the whole
FastAPI application from a single `api/index.py` keeps the deployment to one
function instead of one per router.

Two deployment-specific concerns are handled here:

1. `backend/api/` is a package named `api`, the same as this function's own
   directory. `backend/` is placed at the front of `sys.path` so that
   `import api` inside the backend resolves to the backend's package and never
   to this directory, which would make `from api import air, ai, ...` fail.
2. Vercel never runs a FastAPI `lifespan` hook, so anything that startup
   depends on has to happen at import time. `main.create_app()` already does
   its logging setup at import; the ASGI `app` is what Vercel invokes.
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.abspath(os.path.join(_HERE, os.pardir, "backend"))

# Must precede the function directory, which is also called `api`.
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from main import app  # noqa: E402,F401  (Vercel requires the name `app`)
