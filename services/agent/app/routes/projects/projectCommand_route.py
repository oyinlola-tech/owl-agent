from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ...projects.projectLocation_project import ProjectError
from ...projects.projectStore_project import list_command_history
from ...projects.userCommand_project import prepare_user_command, stream_user_command
from .projectList_route import read_project_store, send_project_error


class UserCommandRun(BaseModel):
    command: str = Field(min_length=1, max_length=2000)
    cwd: str = Field(default="", max_length=4096)
    confirm_high_risk: bool = False
    allow_network: bool = False


def create_project_command_router() -> APIRouter:
    router = APIRouter()

    @router.post("/projects/{project_id}/commands")
    async def run_user_command(  # type: ignore[no-untyped-def]
        project_id: str, payload: UserCommandRun, request: Request
    ):
        store = read_project_store(request)
        executor = request.app.state.exec_service
        try:
            project = store.get_project(project_id)
            prepared = prepare_user_command(
                store.conn,
                executor,
                project,
                payload.command,
                cwd=payload.cwd,
                confirm_high_risk=payload.confirm_high_risk,
                allow_network=payload.allow_network,
            )
        except ProjectError as exc:
            return send_project_error(exc)
        return StreamingResponse(
            stream_user_command(store.conn, executor, prepared),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    @router.get("/projects/{project_id}/commands")
    async def read_command_history(  # type: ignore[no-untyped-def]
        project_id: str, request: Request, limit: int = Query(default=50, ge=1, le=200)
    ):
        store = read_project_store(request)
        try:
            store.get_project(project_id)
        except ProjectError as exc:
            if exc.code != "project_folder_missing":
                return send_project_error(exc)
        return {"commands": list_command_history(store.conn, project_id, limit)}

    return router
