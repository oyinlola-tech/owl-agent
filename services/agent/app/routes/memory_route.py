from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse

from ..memories.sqliteMemoryStore_memory import SqliteMemoryStore
from ..schemas.memory_schema import MemoryCreate, MemoryUpdate
from .providers.providerErrorResponse_route import build_error_response


def create_memory_router(app: FastAPI) -> APIRouter:
    router = APIRouter()

    def current_memory_store() -> SqliteMemoryStore:
        return app.state.memory

    @router.post("/memory", status_code=201)
    async def save_memory(payload: MemoryCreate):  # type: ignore[no-untyped-def]
        row = current_memory_store().save_memory(
            payload.category,
            payload.text,
            project=payload.project,
            confirmed=payload.confirmed,
            source=payload.source,
        )
        if row is None:
            return JSONResponse(
                status_code=200,
                content={"saved": False, "reason": "duplicate or empty after secret scrubbing"},
            )
        return {"saved": True, "memory": row}

    @router.get("/memory")
    async def list_memory(category: str = "", project: str = ""):  # type: ignore[no-untyped-def]
        if category and category not in ("global", "project", "task", "knowledge"):
            return build_error_response(422, "unknown category", "validation")
        return current_memory_store().list_memories(category=category, project=project)

    @router.get("/memory/search")
    async def search_memory(q: str = "", project: str = "", limit: int = 10):  # type: ignore[no-untyped-def]
        return current_memory_store().search_memories(
            q[:200], project=project, limit=min(max(limit, 1), 50)
        )

    @router.patch("/memory/{memory_id}")
    async def update_memory(memory_id: str, payload: MemoryUpdate):  # type: ignore[no-untyped-def]
        row = current_memory_store().update_memory_text(memory_id, payload.text)
        if row is None:
            return build_error_response(404, "memory not found", "not_found")
        return row

    @router.delete("/memory/{memory_id}")
    async def delete_memory(memory_id: str):  # type: ignore[no-untyped-def]
        if not current_memory_store().delete_memory(memory_id):
            return build_error_response(404, "memory not found", "not_found")
        return {"deleted": True}

    @router.post("/memory/{memory_id}/disable")
    async def disable_memory(memory_id: str):  # type: ignore[no-untyped-def]
        if not current_memory_store().set_memory_enabled(memory_id, False):
            return build_error_response(404, "memory not found", "not_found")
        return {"disabled": True}

    @router.post("/memory/{memory_id}/enable")
    async def enable_memory(memory_id: str):  # type: ignore[no-untyped-def]
        if not current_memory_store().set_memory_enabled(memory_id, True):
            return build_error_response(404, "memory not found", "not_found")
        return {"enabled": True}

    @router.post("/memory/clear-project")
    async def clear_project_memory(payload: dict):  # type: ignore[no-untyped-def]
        project = str(payload.get("project", ""))[:256]
        if not project:
            return build_error_response(422, "project is required", "validation")
        return {"cleared": current_memory_store().clear_project_memories(project)}

    @router.get("/memory/history")
    async def memory_history():  # type: ignore[no-untyped-def]
        return current_memory_store().list_memory_history()

    @router.post("/memory/maintain")
    async def maintain_memory(payload: dict):  # type: ignore[no-untyped-def]
        project = str(payload.get("project", ""))[:256]
        return current_memory_store().merge_duplicate_memories(project)

    return router
