from __future__ import annotations

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...memories.promptKnowledge_memory import refresh_project_scan_memory
from ...projects.projectLocation_project import ProjectError
from ...projects.projectStore_project import ProjectStore, recover_interrupted_commands


class ProjectCreate(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    name: str = Field(default="", max_length=200)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    opened: bool = False


def send_project_error(exc: ProjectError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status, content={"detail": exc.detail, "code": exc.code, **exc.extra}
    )


def attach_project_store(app: FastAPI) -> ProjectStore:
    store = getattr(app.state, "projects", None)
    if store is None:
        guards = [app.state.auth]
        executor_guard = getattr(app.state.exec_service, "auth", None)
        if executor_guard is not None and executor_guard is not app.state.auth:
            guards.append(executor_guard)
        storage = getattr(app.state, "local_storage", None)
        data_root = storage.layout.root if storage is not None else ""
        store = ProjectStore(app.state.manager.conn, guards, data_root)
        store.sync_authorized_project_roots()
        recover_interrupted_commands(store.conn)
        app.state.projects = store
    return store


def read_project_store(request: Request) -> ProjectStore:
    return request.app.state.projects


def refresh_project_scan_best_effort(request: Request, project: dict) -> None:
    try:
        refresh_project_scan_memory(
            request.app.state.manager.memory,
            str(project["id"]),
            str(project["name"]),
            str(project["path"]),
        )
    except Exception:
        pass


def create_project_list_router(app: FastAPI) -> APIRouter:
    attach_project_store(app)
    router = APIRouter()

    @router.get("/projects")
    async def list_projects(request: Request):  # type: ignore[no-untyped-def]
        return {"projects": read_project_store(request).list_projects()}

    @router.post("/projects")
    async def add_project(payload: ProjectCreate, request: Request):  # type: ignore[no-untyped-def]
        try:
            project, created = read_project_store(request).add_project(payload.path, payload.name)
        except ProjectError as exc:
            return send_project_error(exc)
        refresh_project_scan_best_effort(request, project)
        return JSONResponse(
            status_code=201 if created else 200, content={"project": project, "created": created}
        )

    @router.get("/projects/{project_id}")
    async def read_project(project_id: str, request: Request):  # type: ignore[no-untyped-def]
        try:
            return {"project": read_project_store(request).refresh_project_stack(project_id)}
        except ProjectError as exc:
            return send_project_error(exc)

    @router.patch("/projects/{project_id}")
    async def update_project(  # type: ignore[no-untyped-def]
        project_id: str, payload: ProjectUpdate, request: Request
    ):
        try:
            project = read_project_store(request).update_project(
                project_id, name=payload.name, opened=payload.opened
            )
        except ProjectError as exc:
            return send_project_error(exc)
        if payload.opened:
            refresh_project_scan_best_effort(request, project)
        return {"project": project}

    @router.delete("/projects/{project_id}")
    async def forget_project(project_id: str, request: Request):  # type: ignore[no-untyped-def]
        try:
            return read_project_store(request).forget_project(project_id)
        except ProjectError as exc:
            return send_project_error(exc)

    return router
