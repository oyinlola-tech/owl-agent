from __future__ import annotations

from fastapi import APIRouter

from ...llms.modelRouter_llm import RoutingError
from ...llms.providers.providerReadiness_provider import is_provider_ready
from ...schemas.task_schema import MessageCreate, TaskCreate
from ...tasks.taskManager_task import TaskManager
from ..providers.providerErrorResponse_route import (
    build_error_response,
    build_provider_not_configured_response,
)


def create_task_lifecycle_router(manager: TaskManager) -> APIRouter:
    router = APIRouter()

    @router.post("/tasks", status_code=201)
    async def create_task(payload: TaskCreate):  # type: ignore[no-untyped-def]
        if not is_provider_ready(manager.provider):
            return build_provider_not_configured_response()
        try:
            return await manager.create_task_and_start(payload, model=payload.model)
        except RoutingError as exc:
            return build_error_response(503, str(exc), "no_usable_model")

    @router.get("/tasks")
    async def list_tasks():  # type: ignore[no-untyped-def]
        return manager.list_tasks()

    @router.get("/tasks/{task_id}")
    async def get_task(task_id: str):  # type: ignore[no-untyped-def]
        return manager.get_task_or_404(task_id)

    @router.post("/tasks/{task_id}/messages", status_code=201)
    async def post_message(task_id: str, payload: MessageCreate):  # type: ignore[no-untyped-def]
        return await manager.add_task_message(task_id, payload)

    @router.post("/tasks/{task_id}/pause")
    async def pause_task(task_id: str):  # type: ignore[no-untyped-def]
        return await manager.pause_task(task_id)

    @router.post("/tasks/{task_id}/resume")
    async def resume_task(task_id: str):  # type: ignore[no-untyped-def]
        return await manager.resume_task(task_id)

    @router.post("/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str):  # type: ignore[no-untyped-def]
        return await manager.cancel_task(task_id)

    return router
