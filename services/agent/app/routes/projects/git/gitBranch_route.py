from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ....executors.gitExecutor_executor import (
    GitError,
    checkout_git_ref,
    create_git_branch,
    read_git_branches,
)
from ....projects.projectLocation_project import ProjectError
from ..projectList_route import read_project_store, send_project_error

REF_NAME_PATTERN = r"^[^-\s\x00][^\s\x00]*$"


class BranchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200, pattern=REF_NAME_PATTERN)
    checkout: bool = False


class BranchCheckout(BaseModel):
    ref: str = Field(min_length=1, max_length=200, pattern=REF_NAME_PATTERN)
    confirm_discard: bool = False


def git_failure(exc: GitError):  # type: ignore[no-untyped-def]
    return send_project_error(ProjectError(502, "git_failed", str(exc)[:500]))


def create_project_git_branch_router() -> APIRouter:
    router = APIRouter()

    @router.get("/projects/{project_id}/git/branches")
    async def list_branches(project_id: str, request: Request):  # type: ignore[no-untyped-def]
        executor = request.app.state.exec_service
        try:
            project = read_project_store(request).get_project(project_id)
            return await read_git_branches(executor, project["path"])
        except ProjectError as exc:
            return send_project_error(exc)
        except GitError as exc:
            return git_failure(exc)

    @router.post("/projects/{project_id}/git/branches")
    async def create_branch(  # type: ignore[no-untyped-def]
        project_id: str, payload: BranchCreate, request: Request
    ):
        # Security: this is the user's own click, auto-authorized, still sandboxed and
        # confined to the project's authorized workspace root.
        executor = request.app.state.exec_service
        try:
            project = read_project_store(request).get_project(project_id)
            result = await create_git_branch(executor, project["path"], payload.name)
            if payload.checkout:
                result = await checkout_git_ref(executor, project["path"], payload.name, True)
            return result
        except ProjectError as exc:
            return send_project_error(exc)
        except GitError as exc:
            return git_failure(exc)

    @router.post("/projects/{project_id}/git/checkout")
    async def switch_branch(  # type: ignore[no-untyped-def]
        project_id: str, payload: BranchCheckout, request: Request
    ):
        executor = request.app.state.exec_service
        try:
            project = read_project_store(request).get_project(project_id)
            return await checkout_git_ref(
                executor, project["path"], payload.ref, payload.confirm_discard
            )
        except ProjectError as exc:
            return send_project_error(exc)
        except GitError as exc:
            return git_failure(exc)

    return router
