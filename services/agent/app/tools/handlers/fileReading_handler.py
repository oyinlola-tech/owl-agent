from __future__ import annotations

import fnmatch
import hashlib
import os
import re

from ...guards.secretScrub_guard import redact_secrets_in_text
from ...guards.workspaceAccess_guard import WorkspaceAccessGuard, WorkspaceError
from ..toolArgument_tool import (
    DirectoryListArguments,
    FileReadArguments,
    FileSearchArguments,
    FileStatArguments,
)
from ..toolError_tool import ToolError

MAX_READ_BYTES = 262144


def hash_file_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def read_text_window(canonical: str, offset: int, limit: int) -> tuple[str, bool]:
    size = os.path.getsize(canonical)
    truncated = size > MAX_READ_BYTES
    with open(canonical, "rb") as fh:
        raw = fh.read(MAX_READ_BYTES + 1)
    text = raw[:MAX_READ_BYTES].decode("utf-8", "replace")
    lines = text.splitlines()
    return "\n".join(lines[offset : offset + limit]), truncated or len(lines) > offset + limit


async def list_workspace_entries(ctx: dict, args: DirectoryListArguments) -> dict:
    auth: WorkspaceAccessGuard = ctx["auth"]
    root = auth.resolve_authorized_path(args.path)
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


async def read_workspace_file(ctx: dict, args: FileReadArguments) -> dict:
    auth: WorkspaceAccessGuard = ctx["auth"]
    canonical = auth.resolve_authorized_path(args.path, allow_sensitive=args.allow_sensitive)
    if not os.path.isfile(canonical):
        raise ToolError("not a file")
    text, truncated = read_text_window(canonical, args.offset, args.limit)
    cleaned, had_secret = redact_secrets_in_text(text)
    return {
        "path": args.path,
        "content": cleaned,
        "truncated": truncated,
        "redacted": had_secret,
        "sha256": hash_file_text(text),
    }


async def search_workspace_files(ctx: dict, args: FileSearchArguments) -> dict:
    auth: WorkspaceAccessGuard = ctx["auth"]
    root = auth.resolve_authorized_path(args.path)
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
            # Security: each file resolves through the workspace guard, so symlinks pointing
            # outside the workspace and sensitive files (.env, keys) are skipped like fs_read.
            try:
                full = auth.resolve_authorized_path(full)
            except WorkspaceError:
                continue
            if not os.path.isfile(full):
                continue
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
                            "path": os.path.relpath(os.path.join(dirpath, name), root),
                            "line": i + 1,
                            "text": redact_secrets_in_text(line[:300])[0],
                        }
                    )
                    if len(hits) >= args.max_results:
                        return {"hits": hits, "truncated": True}
    return {"hits": hits, "truncated": False}


async def stat_workspace_path(ctx: dict, args: FileStatArguments) -> dict:
    auth: WorkspaceAccessGuard = ctx["auth"]
    canonical = auth.resolve_authorized_path(args.path)
    st = os.stat(canonical)
    return {
        "path": args.path,
        "size": st.st_size,
        "mtime": st.st_mtime,
        "dir": os.path.isdir(canonical),
    }
