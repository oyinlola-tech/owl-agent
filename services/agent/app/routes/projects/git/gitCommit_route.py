from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ....databases.recordStamp_database import create_prefixed_id
from ....executors.gitExecutor_executor import (
    GitError,
    commit_git_files,
    read_commit_message_diff,
)
from ....projects.projectLocation_project import ProjectError
from ....projects.projectStore_project import finish_command_row, insert_command_row
from ....tools.handlers.git.gitMessage_handler import draft_commit_message
from ..projectList_route import read_project_store, send_project_error
from .gitBranch_route import git_failure


class CommitRequest(BaseModel):
    files: list[str] = Field(min_length=1, max_length=50)
    message: str = Field(min_length=1, max_length=500)


def journal_commit(conn, project_id: str, files: list[str], message: str, sandbox: dict) -> str:
    run_id = create_prefixed_id("cmd")
    insert_command_row(
        conn,
        {
            "run_id": run_id,
            "project_id": project_id,
            "command": f"git commit -m {message[:100]}",
            "argv": ["git", "commit", "-m", message],
            "cwd": "",
            "risk": "low",
            "risk_reason": "user-initiated commit",
            "sandboxed": sandbox.get("sandboxed"),
            "sandbox_backend": sandbox.get("sandbox_backend", ""),
            "network": False,
        },
        "running",
        "",
    )
    return run_id


def create_project_git_commit_router() -> APIRouter:
    router = APIRouter()

    @router.post("/projects/{project_id}/git/commit-message")
    async def generate_message(project_id: str, request: Request):  # type: ignore[no-untyped-def]
        executor = request.app.state.exec_service
        try:
            project = read_project_store(request).get_project(project_id)
            diff = await read_commit_message_diff(executor, project["path"])
        except ProjectError as exc:
            return send_project_error(exc)
        except GitError as exc:
            return git_failure(exc)
        result = await draft_commit_message(request.app.state.provider, diff)
        return {**result, **executor.describe_sandbox()}

    @router.post("/projects/{project_id}/git/commit")
    async def commit_changes(  # type: ignore[no-untyped-def]
        project_id: str, payload: CommitRequest, request: Request
    ):
        # Security: the commit is the user's own action and is journaled; every listed file
        # still resolves inside the project's authorized workspace through the executor.
        executor = request.app.state.exec_service
        store = read_project_store(request)
        try:
            project = store.get_project(project_id)
        except ProjectError as exc:
            return send_project_error(exc)
        run_id = journal_commit(
            store.conn, project_id, payload.files, payload.message, executor.describe_sandbox()
        )
        try:
            result = await commit_git_files(
                executor, project["path"], payload.files, payload.message
            )
        except GitError as exc:
            finish_command_row(store.conn, run_id, status="error", error=str(exc)[:500])
            return git_failure(exc)
        finish_command_row(store.conn, run_id, status="ok", exit_code=0)
        return result

    return router
