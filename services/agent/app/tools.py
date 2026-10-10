"""Registered, typed tools. Handlers take (ctx, args); model output is validated."""

from __future__ import annotations

import fnmatch
import hashlib
import os
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from .memory import scrub_secrets
from .workspaces import WorkspaceAuth

MAX_READ_BYTES = 262144
MAX_RESULTS = 100


class ToolError(Exception):
    pass


class ListArgs(BaseModel):
    path: str = "."
    depth: int = Field(default=2, ge=1, le=5)


class ReadArgs(BaseModel):
    path: str
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=200, ge=1, le=2000)
    allow_sensitive: bool = False


class SearchArgs(BaseModel):
    pattern: str = Field(min_length=1, max_length=200)
    path: str = "."
    glob: str = Field(default="*", max_length=100)
    max_results: int = Field(default=50, ge=1, le=MAX_RESULTS)


class StatArgs(BaseModel):
    path: str


class CreateArgs(BaseModel):
    path: str
    content: str = Field(max_length=200000)


class ProposeEditArgs(BaseModel):
    path: str
    old: str = Field(min_length=1, max_length=100000)
    new: str = Field(max_length=100000)


class ApplyEditArgs(BaseModel):
    proposal_id: str = Field(min_length=1, max_length=64)


class ExecArgs(BaseModel):
    argv: list[str] = Field(min_length=1, max_length=20)
    cwd: str = "."
    timeout: float | None = Field(default=None, ge=1, le=600)


class GitPathArgs(BaseModel):
    path: str = "."
    ref: str = Field(default="", max_length=120)
    limit: int = Field(default=10, ge=1, le=50)


class GitCommitArgs(BaseModel):
    path: str = "."
    files: list[str] = Field(min_length=1, max_length=50)
    message: str = Field(min_length=1, max_length=500)


class GitPushArgs(BaseModel):
    path: str = "."
    remote: str = Field(default="origin", max_length=60)


class BrowserArgs(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    width: int = Field(default=1440)
    shot: bool = False


@dataclass
class Tool:
    name: str
    description: str
    args_model: type[BaseModel]
    requires_approval: bool
    handler_name: str = ""


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def _read_text(canonical: str, offset: int, limit: int) -> tuple[str, bool]:
    size = os.path.getsize(canonical)
    truncated = size > MAX_READ_BYTES
    with open(canonical, "rb") as fh:
        raw = fh.read(MAX_READ_BYTES + 1)
    text = raw[:MAX_READ_BYTES].decode("utf-8", "replace")
    lines = text.splitlines()
    return "\n".join(lines[offset : offset + limit]), truncated or len(lines) > offset + limit


async def fs_list(ctx: dict, args: ListArgs) -> dict:
    auth: WorkspaceAuth = ctx["auth"]
    root = auth.resolve(args.path)
    if not os.path.isdir(root):
        raise ToolError("not a directory")
    out: list[dict] = []
    base_depth = root.count(os.sep)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d != "__pycache__")[
            :50
        ]
        depth = dirpath.count(os.sep) - base_depth
        if depth >= args.depth:
            dirnames[:] = []
            continue
        for name in sorted(dirnames + filenames)[:200]:
            full = os.path.join(dirpath, name)
            out.append({"path": os.path.relpath(full, root), "dir": os.path.isdir(full)})
            if len(out) >= 500:
                return {"entries": out, "truncated": True}
    return {"entries": out, "truncated": False}


async def fs_read(ctx: dict, args: ReadArgs) -> dict:
    auth: WorkspaceAuth = ctx["auth"]
    canonical = auth.resolve(args.path, allow_sensitive=args.allow_sensitive)
    if not os.path.isfile(canonical):
        raise ToolError("not a file")
    text, truncated = _read_text(canonical, args.offset, args.limit)
    cleaned, had_secret = scrub_secrets(text)
    return {
        "path": args.path,
        "content": cleaned,
        "truncated": truncated,
        "redacted": had_secret,
        "sha256": _content_hash(text),
    }


async def fs_search(ctx: dict, args: SearchArgs) -> dict:
    auth: WorkspaceAuth = ctx["auth"]
    root = auth.resolve(args.path)
    try:
        pattern = re.compile(args.pattern)
    except re.error as exc:
        raise ToolError(f"bad pattern: {exc}") from exc
    hits: list[dict] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
        for name in filenames:
            if not fnmatch.fnmatch(name, args.glob):
                continue
            full = os.path.join(dirpath, name)
            try:
                if os.path.getsize(full) > MAX_READ_BYTES:
                    continue
                with open(full, "rb") as fh:
                    text = fh.read(MAX_READ_BYTES).decode("utf-8", "replace")
            except OSError:
                continue
            for i, line in enumerate(text.splitlines()):
                if pattern.search(line):
                    hits.append(
                        {
                            "path": os.path.relpath(full, root),
                            "line": i + 1,
                            "text": line[:300],
                        }
                    )
                    if len(hits) >= args.max_results:
                        return {"hits": hits, "truncated": True}
    return {"hits": hits, "truncated": False}


async def fs_stat(ctx: dict, args: StatArgs) -> dict:
    auth: WorkspaceAuth = ctx["auth"]
    canonical = auth.resolve(args.path)
    st = os.stat(canonical)
    return {
        "path": args.path,
        "size": st.st_size,
        "mtime": st.st_mtime,
        "dir": os.path.isdir(canonical),
    }


async def fs_create(ctx: dict, args: CreateArgs) -> dict:
    from . import changes as _changes

    auth: WorkspaceAuth = ctx["auth"]
    canonical = auth.resolve(args.path)
    if os.path.lexists(canonical):
        raise ToolError("file exists; propose an edit instead")
    parent = os.path.dirname(canonical)
    if not os.path.isdir(parent):
        raise ToolError("parent directory does not exist")
    with open(canonical, "w", encoding="utf-8") as fh:
        fh.write(args.content)
    _changes.record_create(ctx["conn"], ctx["task_id"], args.path, args.content)
    return {"path": args.path, "bytes": len(args.content.encode())}


async def fs_propose_edit(ctx: dict, args: ProposeEditArgs) -> dict:
    from . import changes as _changes

    return _changes.propose_edit(
        ctx["conn"], ctx["task_id"], ctx["auth"], args.path, args.old, args.new
    )


async def fs_apply_edit(ctx: dict, args: ApplyEditArgs) -> dict:
    from . import changes as _changes

    approval = ctx.get("approval") or {}
    return _changes.apply_edit(
        ctx["conn"], ctx["task_id"], ctx["auth"], args.proposal_id, str(approval.get("id", ""))
    )


async def exec_run(ctx: dict, args: ExecArgs) -> dict:
    service = ctx.get("exec")
    if service is None:
        raise ToolError("execution service unavailable")
    return await service.run(ctx["task_id"], list(args.argv), args.cwd or ".", args.timeout)


async def git_status(ctx: dict, args: GitPathArgs) -> dict:
    from . import git_tools as _git

    return await _git.git_status(ctx["auth"], args.path)


async def git_diff(ctx: dict, args: GitPathArgs) -> dict:
    from . import git_tools as _git

    return await _git.git_diff(ctx["auth"], args.path, args.ref)


async def git_log(ctx: dict, args: GitPathArgs) -> dict:
    from . import git_tools as _git

    return await _git.git_log(ctx["auth"], args.path, args.limit)


async def git_branch(ctx: dict, args: GitPathArgs) -> dict:
    from . import git_tools as _git

    return await _git.git_branch(ctx["auth"], args.path)


async def git_commit(ctx: dict, args: GitCommitArgs) -> dict:
    from . import git_tools as _git

    return await _git.git_commit(ctx["auth"], args.path, list(args.files), args.message)


async def git_push(ctx: dict, args: GitPushArgs) -> dict:
    from . import git_tools as _git

    return await _git.git_push(ctx["auth"], args.path, args.remote)


async def browser_open(ctx: dict, args: BrowserArgs) -> dict:
    service = ctx.get("browser")
    if service is None:
        raise ToolError("browser service unavailable")
    return await service.inspect(args.url, args.width, args.shot)


TOOLS: dict[str, Tool] = {}


def register(tool: Tool) -> Tool:
    tool.handler_name = tool.name
    TOOLS[tool.name] = tool
    return tool


HANDLERS: dict[str, Any] = {
    "fs_list": fs_list,
    "fs_read": fs_read,
    "fs_search": fs_search,
    "fs_stat": fs_stat,
    "fs_create": fs_create,
    "fs_propose_edit": fs_propose_edit,
    "fs_apply_edit": fs_apply_edit,
    "exec_run": exec_run,
    "git_status": git_status,
    "git_diff": git_diff,
    "git_log": git_log,
    "git_branch": git_branch,
    "git_commit": git_commit,
    "git_push": git_push,
    "browser_open": browser_open,
}

register(Tool("fs_list", "List project directories and files.", ListArgs, False))
register(Tool("fs_read", "Read a text file with offset and limit.", ReadArgs, False))
register(Tool("fs_search", "Search file contents by regex.", SearchArgs, False))
register(Tool("fs_stat", "File metadata and modification status.", StatArgs, False))
register(Tool("fs_create", "Create a new file. Requires approval.", CreateArgs, True))
register(
    Tool(
        "fs_propose_edit",
        "Propose a file edit and get a diff. No changes made.",
        ProposeEditArgs,
        False,
    )
)
register(
    Tool(
        "fs_apply_edit",
        "Apply a proposed edit. Requires a bound approval.",
        ApplyEditArgs,
        True,
    )
)
register(Tool("exec_run", "Run a command by argv array. Requires approval.", ExecArgs, True))
register(Tool("git_status", "Read-only git status.", GitPathArgs, False))
register(Tool("git_diff", "Read-only git diff.", GitPathArgs, False))
register(Tool("git_log", "Read-only recent commits.", GitPathArgs, False))
register(Tool("git_branch", "Read-only current branch.", GitPathArgs, False))
register(Tool("git_commit", "Stage paths and commit. Requires approval.", GitCommitArgs, True))
register(Tool("git_push", "Push to a remote. Requires approval.", GitPushArgs, True))
register(Tool("browser_open", "Open a URL and read title and text. Read-only.", BrowserArgs, False))
