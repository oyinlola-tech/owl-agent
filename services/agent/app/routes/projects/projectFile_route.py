from __future__ import annotations

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from ...projects.projectFile_project import (
    list_project_tree,
    read_project_file,
    save_user_file,
    search_project_files,
)
from ...projects.projectLocation_project import ProjectError
from .projectList_route import read_project_store, send_project_error


class UserFileSave(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    content: str
    base_sha256: str | None = Field(default=None, max_length=64)
    create: bool = False


def create_project_file_router() -> APIRouter:
    router = APIRouter()

    @router.get("/projects/{project_id}/tree")
    async def read_tree(  # type: ignore[no-untyped-def]
        project_id: str,
        request: Request,
        path: str = Query(default="", max_length=4096),
        include_ignored: bool = False,
    ):
        try:
            project = read_project_store(request).get_project(project_id)
            return list_project_tree(request.app.state.auth, project["path"], path, include_ignored)
        except ProjectError as exc:
            return send_project_error(exc)

    @router.get("/projects/{project_id}/file")
    async def read_file(  # type: ignore[no-untyped-def]
        project_id: str, request: Request, path: str = Query(min_length=1, max_length=4096)
    ):
        try:
            project = read_project_store(request).get_project(project_id)
            return read_project_file(request.app.state.auth, project["path"], path)
        except ProjectError as exc:
            return send_project_error(exc)

    @router.put("/projects/{project_id}/file")
    async def save_file(  # type: ignore[no-untyped-def]
        project_id: str, payload: UserFileSave, request: Request
    ):
        store = read_project_store(request)
        try:
            project = store.get_project(project_id)
            return save_user_file(
                store.conn,
                request.app.state.auth,
                project,
                payload.path,
                payload.content,
                base_sha256=payload.base_sha256,
                create=payload.create,
            )
        except ProjectError as exc:
            return send_project_error(exc)

    @router.get("/projects/{project_id}/search")
    async def search_files(  # type: ignore[no-untyped-def]
        project_id: str,
        request: Request,
        q: str = Query(min_length=1, max_length=200),
        limit: int = Query(default=50, ge=1, le=200),
    ):
        try:
            project = read_project_store(request).get_project(project_id)
            return search_project_files(request.app.state.auth, project["path"], q, limit)
        except ProjectError as exc:
            return send_project_error(exc)

    return router
