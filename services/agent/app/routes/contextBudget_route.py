from __future__ import annotations

from fastapi import APIRouter, FastAPI

from ..contexts.contextBudget_context import ContextBudgetPlanner, ContextPart
from ..llms.modelRegistry_llm import ModelRegistry
from ..schemas.model_schema import BudgetRequest
from ..settings.serviceSettings_setting import Settings
from ..tasks.taskManager_task import TaskManager


def create_context_budget_router(
    app: FastAPI, settings: Settings, manager: TaskManager
) -> APIRouter:
    router = APIRouter()

    def build_budget_planner_for_model(
        model: str, parts: list[ContextPart]
    ) -> ContextBudgetPlanner:
        reg: ModelRegistry = app.state.registry
        entry = reg.get_model(model) if model else None
        limit = entry["context_window"] if entry and entry["context_window"] else None
        return ContextBudgetPlanner(
            limit=limit,
            reserve_fraction=settings.context_reserve,
            budget_fraction=settings.context_budget,
        )

    @router.post("/context/budget")
    async def context_budget(payload: BudgetRequest):  # type: ignore[no-untyped-def]
        budgets = build_budget_planner_for_model(payload.model, [])
        parts = [ContextPart(category=p.category, text=p.text) for p in payload.parts]
        budgets = build_budget_planner_for_model(payload.model, parts)
        report = budgets.build_budget_report(payload.model or "unspecified", parts)
        return {
            "model": report.model,
            "limit": report.limit,
            "limit_source": report.limit_source,
            "used": report.used,
            "reserved": report.reserved,
            "available": report.available,
            "utilization": report.utilization,
            "over_budget": report.over_budget,
            "compress_at": report.compress_at,
            "should_compress": report.should_compress,
            "parts": report.parts,
        }

    @router.get("/context/compressions")
    async def list_compressions(task_id: str = ""):  # type: ignore[no-untyped-def]
        query = "SELECT * FROM compressions"
        args: list = []
        if task_id:
            query += " WHERE task_id = ?"
            args.append(task_id)
        query += " ORDER BY id DESC LIMIT 50"
        rows = manager.conn.execute(query, args).fetchall()
        return [dict(r) for r in rows]

    return router
