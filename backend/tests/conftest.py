"""Shared fixtures.

No test contacts a live provider: `http_client.request_json` is patched so tests
exercise our aggregation, error handling and response shaping rather than
upstream availability.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("ALLOW_DEV_AUTH", "true")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from fastapi.testclient import TestClient  # noqa: E402

import main as backend_main  # noqa: E402
from api.deps import env_cache  # noqa: E402
from config import get_settings  # noqa: E402

DEV_HEADERS = {"Authorization": "Bearer dev:test-user"}


@pytest.fixture(autouse=True)
def _reset_state():
    """Isolate the shared TTL cache and the lru_cached settings between tests.

    Tests that build a production-flavoured app must not leave `get_settings`
    pointing at production for the next test, and no test may observe another's
    cached provider data.
    """
    import anyio

    get_settings.cache_clear()
    anyio.run(env_cache.clear)
    env_cache.hits = 0
    env_cache.misses = 0
    yield
    get_settings.cache_clear()
    anyio.run(env_cache.clear)


@pytest.fixture(scope="session")
def client():
    get_settings.cache_clear()
    with TestClient(backend_main.app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def auth():
    return DEV_HEADERS
