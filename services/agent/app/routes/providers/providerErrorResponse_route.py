from __future__ import annotations

from fastapi.responses import JSONResponse

from ...llms.providers.providerError_provider import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    ProviderError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)
from ...schemas.service_schema import ErrorBody


def build_provider_error_response(status_code: int, exc: ProviderError) -> JSONResponse:
    code = "provider_error"
    if isinstance(exc, ProviderNotConfiguredError):
        code = "not_configured"
    elif isinstance(exc, InvalidCredentialsError):
        code = "invalid_credentials"
    elif isinstance(exc, QuotaExceededError):
        code = "quota_exceeded"
    elif isinstance(exc, ModelNotAvailableError):
        code = "model_unavailable"
    elif isinstance(exc, RateLimitedError):
        code = "rate_limited"
    elif isinstance(exc, ProviderTimeoutError):
        code = "provider_timeout"
    elif isinstance(exc, ProviderNetworkError):
        code = "network_error"
    elif isinstance(exc, ProviderResponseError):
        code = "bad_response"
    return JSONResponse(
        status_code=status_code,
        content=ErrorBody(detail=str(exc), code=code).model_dump(),
    )


def build_error_response(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorBody(detail=detail, code=code).model_dump(),
    )
