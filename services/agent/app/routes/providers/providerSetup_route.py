from __future__ import annotations

from fastapi import APIRouter, Request

from ...llms.connections.providerPreset_connection import LOCAL_PROVIDER_IDS
from ...llms.providers.providerError_provider import ProviderError, ProviderNetworkError
from ...llms.providerSetup_llm import ProviderSetupService
from ...llms.providerSwitch_llm import ProviderSetupError
from ...schemas.providers.providerSetup_schema import (
    ProviderActiveWrite,
    ProviderKeyWrite,
    ProviderSettingsWrite,
    ProviderTestRead,
    ProviderTestWrite,
)
from .providerErrorResponse_route import build_error_response, describe_provider_error_for_user


def describe_error_for_provider(provider_id: str, error: ProviderError) -> tuple[str, str]:
    code, message = describe_provider_error_for_user(error)
    if provider_id in LOCAL_PROVIDER_IDS and isinstance(error, ProviderNetworkError):
        return "not_running", "The local model server isn't running. Start it and try again."
    return code, message


def create_provider_setup_router() -> APIRouter:
    router = APIRouter()

    def current_setup(request: Request) -> ProviderSetupService:
        return request.app.state.provider_setup

    def build_setup_error_response(exc: ProviderSetupError):  # type: ignore[no-untyped-def]
        return build_error_response(exc.status, exc.message, exc.code)

    @router.get("/providers")
    async def list_providers(request: Request):  # type: ignore[no-untyped-def]
        return current_setup(request).list_provider_cards()

    @router.get("/providers/local")
    async def discover_local_providers(request: Request):  # type: ignore[no-untyped-def]
        return {"runners": await current_setup(request).discover_local_models()}

    @router.put("/providers/active")
    async def choose_active_provider(payload: ProviderActiveWrite, request: Request):  # type: ignore[no-untyped-def]
        setup = current_setup(request)
        try:
            model = await setup.activate_provider(payload.provider_id, payload.model)
        except ProviderSetupError as exc:
            return build_setup_error_response(exc)
        if payload.provider_id == "none":
            return {"active": "none", "model": "", "provider": None}
        return {
            "active": payload.provider_id,
            "model": model,
            "provider": setup.describe_provider_card(payload.provider_id),
        }

    @router.put("/providers/{provider_id}/key")
    async def save_provider_key(provider_id: str, payload: ProviderKeyWrite, request: Request):  # type: ignore[no-untyped-def]
        try:
            return current_setup(request).save_provider_key(provider_id, payload.key)
        except ProviderSetupError as exc:
            return build_setup_error_response(exc)

    @router.delete("/providers/{provider_id}/key")
    async def delete_provider_key(provider_id: str, request: Request):  # type: ignore[no-untyped-def]
        try:
            return current_setup(request).delete_provider_key(provider_id)
        except ProviderSetupError as exc:
            return build_setup_error_response(exc)

    @router.put("/providers/{provider_id}/settings")
    async def update_provider_settings(
        provider_id: str, payload: ProviderSettingsWrite, request: Request
    ):  # type: ignore[no-untyped-def]
        try:
            return current_setup(request).update_provider_settings(
                provider_id,
                base_url=payload.base_url,
                model=payload.model,
                server_fallbacks=payload.server_fallbacks,
            )
        except ProviderSetupError as exc:
            return build_setup_error_response(exc)

    @router.post("/providers/{provider_id}/test", response_model=ProviderTestRead)
    async def test_provider_connection(
        provider_id: str, request: Request, payload: ProviderTestWrite | None = None
    ):  # type: ignore[no-untyped-def]
        body = payload or ProviderTestWrite()
        try:
            result, error = await current_setup(request).run_connection_test(
                provider_id, key=body.key, base_url=body.base_url
            )
        except ProviderSetupError as exc:
            return build_setup_error_response(exc)
        read = ProviderTestRead(provider=provider_id, **result)
        if error is not None:
            read.code, read.error = describe_error_for_provider(provider_id, error)
        return read

    @router.get("/providers/{provider_id}/models")
    async def list_provider_models(provider_id: str, request: Request):  # type: ignore[no-untyped-def]
        try:
            result, error = await current_setup(request).refresh_provider_models(provider_id)
        except ProviderSetupError as exc:
            return build_setup_error_response(exc)
        result["error"], result["code"] = "", ""
        if error is not None:
            result["code"], result["error"] = describe_error_for_provider(provider_id, error)
        return result

    return router
