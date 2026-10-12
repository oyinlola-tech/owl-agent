from __future__ import annotations

from fastapi import APIRouter, Request

from ...llms.providers.providerReadiness_provider import is_provider_ready
from ...memories.memorySuggestion_memory import list_memory_suggestions
from ...memories.userProfile_memory import UserProfileStore
from ...schemas.profiles.userProfile_schema import (
    OnboardingRead,
    OnboardingWrite,
    UserProfileRead,
    UserProfileWrite,
)


def create_user_profile_router() -> APIRouter:
    router = APIRouter()

    def current_profile_store(request: Request) -> UserProfileStore:
        return request.app.state.manager.knowledge.profile

    @router.get("/profile", response_model=UserProfileRead)
    async def read_profile(request: Request) -> UserProfileRead:
        return UserProfileRead(**current_profile_store(request).read_profile())

    @router.put("/profile", response_model=UserProfileRead)
    async def save_profile(payload: UserProfileWrite, request: Request) -> UserProfileRead:
        saved = current_profile_store(request).save_profile(payload.model_dump())
        return UserProfileRead(**saved)

    def build_onboarding_read(request: Request, progress: dict) -> OnboardingRead:
        profile = current_profile_store(request).read_profile()
        return OnboardingRead(
            **progress,
            profile_empty=profile["is_empty"],
            provider_configured=is_provider_ready(request.app.state.provider),
        )

    @router.get("/onboarding", response_model=OnboardingRead)
    async def read_onboarding(request: Request) -> OnboardingRead:
        return build_onboarding_read(request, current_profile_store(request).read_onboarding())

    @router.put("/onboarding", response_model=OnboardingRead)
    async def save_onboarding(payload: OnboardingWrite, request: Request) -> OnboardingRead:
        progress = current_profile_store(request).save_onboarding(
            payload.step, payload.completed, list(payload.skipped_steps)
        )
        return build_onboarding_read(request, progress)

    @router.get("/tasks/{task_id}/memories")
    async def task_memories(task_id: str, request: Request):  # type: ignore[no-untyped-def]
        manager = request.app.state.manager
        manager.get_task_or_404(task_id)
        return {
            "used": manager.list_task_memory_uses(task_id),
            "suggestions": list_memory_suggestions(manager.conn, task_id),
        }

    return router
