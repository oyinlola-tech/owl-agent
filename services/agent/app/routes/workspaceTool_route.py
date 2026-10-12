from __future__ import annotations

from fastapi import APIRouter, Request

from ..guards.workspaceAccess_guard import WorkspaceAccessGuard
from ..tools.toolRegistry_tool import REGISTERED_TOOLS


def create_workspace_tool_router() -> APIRouter:
    router = APIRouter()

    @router.get("/workspaces")
    async def list_workspaces(request: Request):  # type: ignore[no-untyped-def]
        auth: WorkspaceAccessGuard = request.app.state.auth
        return {"roots": auth.list_roots()}

    @router.get("/tools")
    async def list_tools():  # type: ignore[no-untyped-def]
        return [
            {"name": name, "description": t.description, "requires_approval": t.requires_approval}
            for name, t in sorted(REGISTERED_TOOLS.items())
        ]

    return router
