from __future__ import annotations

from fastapi import APIRouter

from ...schemas.approval_schema import ApprovalRequest, DecisionCreate
from ...tasks.taskManager_task import TaskManager


def create_task_approval_router(manager: TaskManager) -> APIRouter:
    router = APIRouter()

    @router.post("/tasks/{task_id}/approvals", status_code=201)
    async def request_approval(task_id: str, payload: ApprovalRequest):  # type: ignore[no-untyped-def]
        return await manager.create_approval_request(task_id, payload)

    @router.get("/tasks/{task_id}/approvals")
    async def list_approvals(task_id: str):  # type: ignore[no-untyped-def]
        return manager.list_task_approvals(task_id)

    @router.post("/tasks/{task_id}/approvals/{approval_id}/decision")
    async def decide(task_id: str, approval_id: str, payload: DecisionCreate):  # type: ignore[no-untyped-def]
        return await manager.record_approval_decision(task_id, approval_id, payload)

    return router
