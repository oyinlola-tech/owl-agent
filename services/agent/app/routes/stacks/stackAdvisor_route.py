from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI, Request

from ...llms.providers.baseProvider_provider import ModelProvider
from ...llms.providers.providerError_provider import ProviderError
from ...llms.providers.providerReadiness_provider import is_provider_ready
from ...stacks.modelRanking_stack import build_ranking_prompt, parse_model_ranking
from ...stacks.recommendationSchema_stack import (
    StackCatalogResponse,
    StackRecommendRequest,
    StackRecommendResponse,
)
from ...stacks.stackCatalog_stack import known_stack_ids, load_catalog
from ...stacks.stackRecommendation_stack import recommend_stacks

log = logging.getLogger("owl")


def read_profile_languages(app: FastAPI) -> list[str]:
    # Security: the stack advisor only reads the profile; it never writes it or logs its contents.
    try:
        from ...memories.userProfile_memory import UserProfileStore

        conn = app.state.registry.conn
        profile = UserProfileStore(conn).read_profile()
        languages = profile.get("languages", [])
        return [str(lang) for lang in languages] if isinstance(languages, list) else []
    except Exception as exc:
        log.info("stack advisor profile read failed: %s", type(exc).__name__)
        return []


async def rank_with_model(
    active: ModelProvider, description: str, constraints: dict | None
) -> list[str] | None:
    catalog = load_catalog()
    prompt = build_ranking_prompt(description, constraints, catalog)
    try:
        reply = await active.complete([{"role": "user", "content": prompt}])
    except ProviderError:
        return None
    except Exception as exc:  # noqa: BLE001
        log.info("stack ranking model call failed: %s", type(exc).__name__)
        return None
    return parse_model_ranking(reply, known_stack_ids())


def create_stack_advisor_router(app: FastAPI) -> APIRouter:
    router = APIRouter()

    @router.get("/stacks", response_model=StackCatalogResponse)
    async def browse_stacks():  # type: ignore[no-untyped-def]
        stacks = [entry.to_dict() for entry in load_catalog()]
        return StackCatalogResponse(count=len(stacks), stacks=stacks)

    @router.post("/stacks/recommend", response_model=StackRecommendResponse)
    async def recommend(payload: StackRecommendRequest, request: Request):  # type: ignore[no-untyped-def]
        constraints = payload.constraints.model_dump() if payload.constraints else None
        active: ModelProvider = request.app.state.provider
        ranking_ids: list[str] | None = None
        if is_provider_ready(active) and str(active.describe().get("name", "")) != "mock":
            ranking_ids = await rank_with_model(active, payload.description, constraints)
        profile_languages = read_profile_languages(request.app)
        ranked_by, recommendations = recommend_stacks(
            payload.description,
            constraints=constraints,
            profile_languages=profile_languages,
            ranking_ids=ranking_ids,
        )
        return StackRecommendResponse(ranked_by=ranked_by, recommendations=recommendations)

    return router
