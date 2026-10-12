from __future__ import annotations

import re

from fastapi import APIRouter, Request

from ...executors.gitExecutor_executor import GitError, run_git_command
from ...guards.workspaceAccess_guard import WorkspaceAccessGuard
from ...projects.projectLocation_project import ProjectError
from .projectList_route import read_project_store, send_project_error

BRANCH_HEADER_PATTERN = re.compile(
    r"^(?P<branch>.+?)(?:\.\.\.(?P<upstream>\S+))?(?: \[(?P<tracking>[^\]]*)\])?$"
)
MAX_CHANGED_FILES = 1000
STATUS_LABELS = {
    "M": "modified",
    "A": "added",
    "D": "deleted",
    "R": "renamed",
    "C": "copied",
    "T": "type_changed",
}


def parse_branch_header(header: str) -> dict:
    text = header[3:] if header.startswith("## ") else header
    info: dict = {"branch": "", "upstream": "", "ahead": 0, "behind": 0, "detached": False}
    if text.startswith("No commits yet on ") or text.startswith("Initial commit on "):
        info["branch"] = text.split(" on ", 1)[1]
        return info
    if text.startswith("HEAD (no branch)"):
        info["detached"] = True
        return info
    match = BRANCH_HEADER_PATTERN.match(text)
    if match is None:
        info["branch"] = text
        return info
    info["branch"] = match.group("branch")
    info["upstream"] = match.group("upstream") or ""
    for part in (match.group("tracking") or "").split(","):
        words = part.split()
        if len(words) == 2 and words[0] in ("ahead", "behind") and words[1].isdigit():
            info[words[0]] = int(words[1])
    return info


def describe_change(index: str, worktree: str) -> str:
    if index == "?" and worktree == "?":
        return "untracked"
    if "U" in (index, worktree) or (index == worktree and index in "AD"):
        return "conflicted"
    code = worktree if worktree != " " else index
    return STATUS_LABELS.get(code, "changed")


def parse_porcelain_z(output: str) -> tuple[dict, list[dict], bool]:
    records = output.split("\0")
    header = records[0] if records and records[0].startswith("## ") else ""
    position = 1 if header else 0
    changed: list[dict] = []
    while position < len(records):
        record = records[position]
        position += 1
        if len(record) < 4:
            continue
        index, worktree, path = record[0], record[1], record[3:]
        item = {
            "path": path,
            "index": index,
            "worktree": worktree,
            "status": describe_change(index, worktree),
        }
        if index in "RC" and position < len(records):
            item["original_path"] = records[position]
            position += 1
        if WorkspaceAccessGuard.is_sensitive_path(path.rstrip("/"), path):
            continue
        changed.append(item)
    truncated = len(changed) > MAX_CHANGED_FILES
    return parse_branch_header(header), changed[:MAX_CHANGED_FILES], truncated


def create_project_git_router() -> APIRouter:
    router = APIRouter()

    @router.get("/projects/{project_id}/git")
    async def read_git_summary(project_id: str, request: Request):  # type: ignore[no-untyped-def]
        executor = request.app.state.exec_service
        try:
            project = read_project_store(request).get_project(project_id)
        except ProjectError as exc:
            return send_project_error(exc)
        try:
            output = await run_git_command(
                executor,
                project["path"],
                "status",
                "--porcelain=v1",
                "--branch",
                "-z",
                "--untracked-files=normal",
                task_id=f"project-git:{project_id}",
            )
        except GitError as exc:
            message = str(exc)
            if "not a git repository" in message.lower():
                return {"is_repo": False, "changed": [], **executor.describe_sandbox()}
            return send_project_error(ProjectError(502, "git_failed", message[:500]))
        branch, changed, truncated = parse_porcelain_z(output)
        return {
            "is_repo": True,
            **branch,
            "changed": changed,
            "changed_count": len(changed),
            "truncated": truncated,
            "clean": not changed,
            **executor.describe_sandbox(),
        }

    return router
