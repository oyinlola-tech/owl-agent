from __future__ import annotations

from fastapi import APIRouter

from ...executors.fileChange_executor import (
    ChangeConflictError,
    ChangeError,
    list_change_journal,
    revert_journaled_change,
)
from ...tasks.taskManager_task import TaskManager
from ..providers.providerErrorResponse_route import build_error_response


def create_task_detail_router(manager: TaskManager) -> APIRouter:
    router = APIRouter()

    @router.post("/tasks/{task_id}/checkpoints", status_code=201)
    async def create_checkpoint(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        label = str(payload.get("label", "manual"))[:120]
        return await manager.save_checkpoint(task_id, label)

    @router.get("/tasks/{task_id}/checkpoints")
    async def list_checkpoints(task_id: str):  # type: ignore[no-untyped-def]
        return manager.list_checkpoints(task_id)

    @router.get("/tasks/{task_id}/detail")
    async def task_detail(task_id: str):  # type: ignore[no-untyped-def]
        task = manager.get_task_or_404(task_id)
        return {
            "task": task,
            "steps": manager.list_plan_steps(task_id),
            "tool_calls": manager.list_tool_calls(task_id),
            "checkpoints": manager.list_checkpoints(task_id),
            "usage": manager.list_task_usage(task_id),
            "verifications": manager.list_verification_runs(task_id),
            "verification": manager.summarize_verification(task_id),
            "memories_used": manager.list_task_memory_uses(task_id),
        }

    @router.get("/tasks/{task_id}/tool-calls")
    async def list_tool_calls(task_id: str):  # type: ignore[no-untyped-def]
        manager.get_task_or_404(task_id)
        return manager.list_tool_calls(task_id)

    @router.get("/tasks/{task_id}/journal")
    async def list_journal(task_id: str):  # type: ignore[no-untyped-def]
        manager.get_task_or_404(task_id)
        return list_change_journal(manager.conn, task_id)

    @router.post("/tasks/{task_id}/revert")
    async def revert_journal(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        manager.get_task_or_404(task_id)
        journal_id = str(payload.get("journal_id", ""))[:64]
        if not journal_id:
            return build_error_response(422, "journal_id is required", "validation")
        try:
            result = revert_journaled_change(
                manager.conn, manager.workspace_guard, task_id, journal_id
            )
        except ChangeConflictError as exc:
            return build_error_response(409, str(exc), "conflict")
        except ChangeError as exc:
            return build_error_response(404, str(exc), "not_found")
        await manager.bus.publish_event(task_id, "change.reverted", result)
        return result

    return router
