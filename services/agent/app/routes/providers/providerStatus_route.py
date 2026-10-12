from __future__ import annotations

from fastapi import APIRouter, Request

from ...llms.providers.baseProvider_provider import ModelProvider
from ...llms.providers.providerError_provider import (
    ProviderError,
    ProviderNotConfiguredError,
    RateLimitedError,
)
from ...schemas.service_schema import HealthRead, ProviderRead, VerifyRead
from ...settings.serviceSettings_setting import Settings
from .providerErrorResponse_route import (
    build_provider_error_response,
    describe_provider_error_for_user,
)


def create_provider_status_router(provider: ModelProvider, settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/health", response_model=HealthRead)
    async def health() -> HealthRead:
        desc = provider.describe()
        return HealthRead(
            status="ok",
            version=settings.version,
            provider=str(desc["name"]),
            provider_configured=bool(desc["configured"]),
        )

    @router.get("/provider", response_model=ProviderRead)
    async def provider_info() -> ProviderRead:
        desc = provider.describe()
        return ProviderRead(
            name=str(desc["name"]),
            configured=bool(desc["configured"]),
            model=str(desc.get("model", "")),
        )

    @router.post("/provider/verify", response_model=VerifyRead)
    async def verify_provider(request: Request) -> VerifyRead:
        active: ModelProvider = request.app.state.provider
        desc = active.describe()
        name = str(desc["name"])
        model = str(desc.get("model", ""))
        if name == "mock":
            return VerifyRead(ok=True, provider=name, model=model)
        if not desc.get("configured"):
            return VerifyRead(
                ok=False,
                provider=name,
                model=model,
                error="Connect a model first.",
                code="provider_not_configured",
            )
        try:
            await active.list_models()
        except ProviderError as exc:
            code, message = describe_provider_error_for_user(exc)
            return VerifyRead(
                ok=False,
                provider=name,
                model=model,
                error=message,
                code="rate_limited" if code == "rate_limited" else "unavailable",
            )
        return VerifyRead(ok=True, provider=name, model=model)

    @router.get("/provider/models")
    async def list_provider_models(request: Request):  # type: ignore[no-untyped-def]
        active: ModelProvider = request.app.state.provider
        try:
            return {"models": await active.list_models()}
        except RateLimitedError as exc:
            return build_provider_error_response(429, exc)
        except ProviderNotConfiguredError as exc:
            return build_provider_error_response(400, exc)
        except ProviderError as exc:
            return build_provider_error_response(502, exc)

    return router
