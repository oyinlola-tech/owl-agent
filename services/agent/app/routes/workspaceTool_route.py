from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..guards.workspaceAccess_guard import WorkspaceAccessGuard
from ..tools.customTool_tool import (
    create_custom_tool,
    delete_custom_tool,
    get_custom_tool,
    list_custom_tools,
    set_custom_tool_enabled,
    sync_custom_tools_into_registry,
    update_custom_tool,
)
from ..tools.toolRegistry_tool import REGISTERED_TOOLS
from .providers.providerErrorResponse_route import build_error_response


class CustomToolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=500)
    argv: list[str] = Field(min_length=1, max_length=20)
    risk: str = Field(default="high", max_length=10)
    project: str = Field(default="", max_length=256)


class CustomToolUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=500)
    argv: list[str] | None = Field(default=None, min_length=1, max_length=20)
    risk: str | None = Field(default=None, max_length=10)
    project: str | None = Field(default=None, max_length=256)


def create_workspace_tool_router() -> APIRouter:
    router = APIRouter()

    @router.get("/workspaces")
    async def list_workspaces(request: Request):  # type: ignore[no-untyped-def]
        auth: WorkspaceAccessGuard = request.app.state.auth
        return {"roots": auth.list_roots()}

    @router.get("/tools")
    async def list_tools(request: Request):  # type: ignore[no-untyped-def]
        custom = {
            f"custom-{t['name']}": t
            for t in sync_custom_tools_into_registry(request.app.state.memory.conn)
        }
        listed = []
        for name, t in sorted(REGISTERED_TOOLS.items()):
            entry: dict = {
                "name": name,
                "description": t.description,
                "requires_approval": t.requires_approval,
            }
            if name in custom:
                entry.update(
                    {
                        "custom": True,
                        "id": custom[name]["id"],
                        "argv": custom[name]["argv"],
                        "risk": custom[name]["risk"],
                        "project": custom[name]["project"],
                        "enabled": True,
                    }
                )
            listed.append(entry)
        return listed

    @router.get("/custom-tools")
    async def read_custom_tools(request: Request, project: str = ""):  # type: ignore[no-untyped-def]
        sync_custom_tools_into_registry(request.app.state.memory.conn)
        return list_custom_tools(request.app.state.memory.conn, project=project[:256])

    @router.post("/custom-tools", status_code=201)
    async def write_custom_tool(request: Request, payload: CustomToolCreate):  # type: ignore[no-untyped-def]
        conn = request.app.state.memory.conn
        try:
            created = create_custom_tool(
                conn,
                name=payload.name,
                description=payload.description,
                argv=payload.argv,
                risk=payload.risk,
                project=payload.project,
            )
        except ValueError as exc:
            message = str(exc)
            if "already exists" in message:
                return build_error_response(409, message, "duplicate")
            return build_error_response(422, message, "validation")
        sync_custom_tools_into_registry(conn)
        return created

    @router.patch("/custom-tools/{tool_id}")
    async def patch_custom_tool(request: Request, tool_id: str, payload: CustomToolUpdate):  # type: ignore[no-untyped-def]
        conn = request.app.state.memory.conn
        try:
            updated = update_custom_tool(
                conn,
                tool_id,
                description=payload.description,
                argv=payload.argv,
                risk=payload.risk,
                project=payload.project,
            )
        except ValueError as exc:
            message = str(exc)
            if "already exists" in message:
                return build_error_response(409, message, "duplicate")
            return build_error_response(422, message, "validation")
        if updated is None:
            return build_error_response(404, "custom tool not found", "not_found")
        sync_custom_tools_into_registry(conn)
        return updated

    @router.delete("/custom-tools/{tool_id}")
    async def remove_custom_tool(request: Request, tool_id: str):  # type: ignore[no-untyped-def]
        conn = request.app.state.memory.conn
        if not delete_custom_tool(conn, tool_id):
            return build_error_response(404, "custom tool not found", "not_found")
        sync_custom_tools_into_registry(conn)
        return {"deleted": True}

    @router.post("/custom-tools/{tool_id}/enable")
    async def enable_custom_tool(request: Request, tool_id: str):  # type: ignore[no-untyped-def]
        conn = request.app.state.memory.conn
        if get_custom_tool(conn, tool_id) is None:
            return build_error_response(404, "custom tool not found", "not_found")
        set_custom_tool_enabled(conn, tool_id, True)
        sync_custom_tools_into_registry(conn)
        return {"enabled": True}

    @router.post("/custom-tools/{tool_id}/disable")
    async def disable_custom_tool(request: Request, tool_id: str):  # type: ignore[no-untyped-def]
        conn = request.app.state.memory.conn
        if get_custom_tool(conn, tool_id) is None:
            return build_error_response(404, "custom tool not found", "not_found")
        set_custom_tool_enabled(conn, tool_id, False)
        sync_custom_tools_into_registry(conn)
        return {"disabled": True}

    return router
