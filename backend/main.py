"""AirGuard AI backend application factory and entrypoint.

Run locally with:  uvicorn main:app --reload --port 8001
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from api import air, ai, carbon, geocode, health, rag, weather  # noqa: E402
from config import describe_configuration, get_settings  # noqa: E402
from errors import register_exception_handlers  # noqa: E402
from http_client import close_client  # noqa: E402
from logging_config import get_logger, setup_logging  # noqa: E402
from middleware import RateLimitMiddleware, TimingMiddleware  # noqa: E402

log = get_logger("airguard.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    log.info("AirGuard AI backend starting in %s", settings.environment)
    for capability, enabled in describe_configuration(settings).items():
        if isinstance(enabled, bool):
            log.info("  %s: %s", capability, "enabled" if enabled else "disabled")
    if settings.allowed_origins:
        log.info("  allowed_origins: %s", ", ".join(settings.allowed_origins))
    yield
    await close_client()
    log.info("AirGuard AI backend stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    application = FastAPI(
        title="AirGuard AI Backend",
        version="2.0.0",
        description=(
            "Environmental intelligence API: air quality, weather forecasting, "
            "AQI outlook, carbon estimation and a retrieval-grounded assistant."
        ),
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=3600,
    )
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(TimingMiddleware)

    register_exception_handlers(application)

    application.include_router(health.router)
    application.include_router(air.router)
    application.include_router(weather.router)
    application.include_router(geocode.router)
    application.include_router(ai.router)
    application.include_router(rag.router)
    application.include_router(carbon.router)

    return application


app = create_app()
