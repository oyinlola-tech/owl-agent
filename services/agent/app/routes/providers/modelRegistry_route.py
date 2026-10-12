from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ...contexts.tokenCounter_context import count_tokens
from ...llms.modelRegistry_llm import ModelRegistry
from ...llms.modelRouter_llm import ModelRouter, RoutingError, classify_prompt
from ...llms.providers.baseProvider_provider import ModelProvider
from ...llms.providers.providerError_provider import ProviderError, ProviderNotConfiguredError
from ...schemas.model_schema import ModelEntry, RouteRead, RouteRequest
from .providerErrorResponse_route import build_error_response, build_provider_error_response


def create_model_registry_router() -> APIRouter:
    router = APIRouter()

    @router.get("/models")
    async def list_models(request: Request):  # type: ignore[no-untyped-def]
        reg: ModelRegistry = request.app.state.registry
        return {"models": [ModelEntry(**m).model_dump() for m in reg.list_models()]}

    @router.post("/models/refresh")
    async def refresh_models(request: Request):  # type: ignore[no-untyped-def]
        reg: ModelRegistry = request.app.state.registry
        active: ModelProvider = request.app.state.provider
        try:
            ids = await active.list_models()
        except ProviderNotConfiguredError as exc:
            return build_provider_error_response(400, exc)
        except ProviderError as exc:
            return build_provider_error_response(502, exc)
        return reg.sync_with_live_catalog(ids)

    @router.post("/models/{model_id:path}/validate")
    async def validate_model(model_id: str, request: Request):  # type: ignore[no-untyped-def]
        reg: ModelRegistry = request.app.state.registry
        active: ModelProvider = request.app.state.provider
        if active.describe().get("name") == "mock":
            reg.save_model(model_id, status="verified", capabilities=["chat"])
            return {"id": model_id, "status": "verified"}
        try:
            await active.complete(
                [{"role": "user", "content": "Reply with the single word ok."}], model_id
            )
        except ProviderError as exc:
            reg.save_model(model_id, status="unavailable")
            return JSONResponse(
                status_code=200,
                content={"id": model_id, "status": "unavailable", "error": str(exc)},
            )
        reg.save_model(model_id, status="verified", capabilities=["chat"])
        return {"id": model_id, "status": "verified"}

    @router.post("/route", response_model=RouteRead)
    async def route_prompt(payload: RouteRequest, request: Request):  # type: ignore[no-untyped-def]
        active_router: ModelRouter = request.app.state.router
        est, _ = count_tokens(payload.prompt)
        estimated = est + payload.estimated_tokens
        try:
            picked, reason = active_router.choose_model(
                payload.prompt, model=payload.model, estimated_tokens=estimated
            )
        except RoutingError as exc:
            return build_error_response(503, str(exc), "no_usable_model")
        return RouteRead(model=picked, reason=reason, category=classify_prompt(payload.prompt))

    return router
