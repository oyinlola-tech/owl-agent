from __future__ import annotations

import logging

from fastapi.responses import JSONResponse

from ...guards.secretScrub_guard import redact_secrets_in_text
from ...llms.providers.providerError_provider import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    ProviderError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderRefusalError,
    ProviderRequestRejectedError,
    ProviderResponseError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)
from ...schemas.service_schema import ErrorBody

log = logging.getLogger("owl")

PROVIDER_ERROR_DESCRIPTIONS: tuple[tuple[type[ProviderError], str, str], ...] = (
    (
        ProviderNotConfiguredError,
        "not_configured",
        "No AI provider is set up yet. Add an API key or a local model in Settings.",
    ),
    (
        InvalidCredentialsError,
        "invalid_credentials",
        "The provider rejected the API key. Check it in Settings.",
    ),
    (QuotaExceededError, "quota_exceeded", "The provider says your quota or credit is used up."),
    (ModelNotAvailableError, "model_unavailable", "That model isn't available from this provider."),
    (RateLimitedError, "rate_limited", "The provider is limiting requests. Try again shortly."),
    (ProviderTimeoutError, "provider_timeout", "The provider took too long to answer."),
    (
        ProviderNetworkError,
        "network_error",
        "OWL couldn't reach the provider. Check the connection.",
    ),
    (ProviderResponseError, "bad_response", "The provider sent a response OWL couldn't read."),
    (
        ProviderRefusalError,
        "model_refused",
        "The model declined this request. Rephrase it or pick another model.",
    ),
)
PROVIDER_NOT_CONFIGURED_MESSAGE = (
    "Connect a model first: add an API key or a local model in Settings → AI providers."
)
ROUTING_FAILURE_MESSAGE = (
    "No available model can handle this request. Check the models in Settings."
)


def log_routing_failure(exc: Exception) -> None:
    log.info("routing failed: %s", redact_secrets_in_text(str(exc))[0])


def describe_provider_error_for_user(exc: ProviderError) -> tuple[str, str]:
    # Security: provider error text can echo request details from upstream, so clients only
    # get a fixed message per error type; the redacted detail stays in the service log.
    log.warning("provider error %s: %s", type(exc).__name__, redact_secrets_in_text(str(exc))[0])
    if isinstance(exc, ProviderRequestRejectedError):
        return "request_rejected", redact_secrets_in_text(str(exc))[0][:400]
    for error_type, code, message in PROVIDER_ERROR_DESCRIPTIONS:
        if isinstance(exc, error_type):
            return code, message
    return "provider_error", "The AI provider returned an error."


def build_provider_error_response(status_code: int, exc: ProviderError) -> JSONResponse:
    code, message = describe_provider_error_for_user(exc)
    return JSONResponse(
        status_code=status_code,
        content=ErrorBody(detail=message, code=code).model_dump(),
    )


def build_error_response(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorBody(detail=detail, code=code).model_dump(),
    )


def build_provider_not_configured_response() -> JSONResponse:
    return build_error_response(409, PROVIDER_NOT_CONFIGURED_MESSAGE, "provider_not_configured")
