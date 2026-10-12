from __future__ import annotations

from fastapi import APIRouter, FastAPI

from ..llms.usageRecorder_llm import UsageRecorder


def create_usage_report_router(app: FastAPI) -> APIRouter:
    router = APIRouter()

    @router.get("/usage")
    async def list_usage(task_id: str = ""):  # type: ignore[no-untyped-def]
        usage: UsageRecorder = app.state.usage
        if task_id:
            return usage.list_usage_for_task(task_id)
        rows = usage.conn.execute(
            "SELECT * FROM usage_records ORDER BY id DESC LIMIT 100"
        ).fetchall()
        return [dict(r) for r in rows]

    return router
