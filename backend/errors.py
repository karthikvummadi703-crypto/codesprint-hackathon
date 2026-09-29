"""Application exception types and global FastAPI error handlers.

Internal failures are logged with detail but never returned to the client: an
unexpected exception becomes a generic 500 so that stack traces, file paths and
provider URLs cannot leak.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from http_client import ProviderError
from logging_config import get_logger, redact

log = get_logger("airguard.errors")


class AppError(Exception):
    """Base class for expected, client-visible failures."""

    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AuthenticationError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class RateLimitError(AppError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "Too many requests. Please wait a moment and try again.",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.retry_after = retry_after


class NotFoundError(AppError):
    def __init__(self, message: str = "Not found") -> None:
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class UpstreamUnavailableError(AppError):
    def __init__(self, message: str = "An upstream data provider is temporarily unavailable.") -> None:
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {}
        if isinstance(exc, RateLimitError):
            headers["Retry-After"] = str(exc.retry_after)
        if exc.status_code >= 500:
            log.error("app error: %s", redact(exc.message))
        return JSONResponse({"detail": exc.message}, status_code=exc.status_code, headers=headers)

    @app.exception_handler(ProviderError)
    async def _provider_error(_: Request, exc: ProviderError) -> JSONResponse:
        log.error("provider %s unavailable: %s", exc.provider, redact(exc))
        return JSONResponse(
            {
                "detail": f"The {exc.provider} data provider is temporarily unavailable. Please try again shortly."
            },
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code >= 500:
            log.error("http error %s", exc.status_code)
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Surface only field locations and messages, never submitted values.
        problems = [
            {"field": ".".join(str(p) for p in err.get("loc", [])[1:]) or "body", "issue": err.get("msg", "invalid")}
            for err in exc.errors()
        ]
        return JSONResponse(
            {"detail": "Invalid request.", "problems": problems},
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error: %s", redact(exc))
        return JSONResponse(
            {"detail": "Internal server error."},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
