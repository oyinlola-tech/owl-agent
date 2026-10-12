from __future__ import annotations

import hashlib
import os
import sqlite3
import stat
import tempfile
import time

from ..databases.recordStamp_database import create_prefixed_id, current_utc_time
from ..guards.workspaceAccess_guard import WorkspaceAccessGuard, WorkspaceError
from .gitIgnore_project import ALWAYS_HIDDEN_NAMES, GitIgnoreMatcher
from .projectLocation_project import ProjectError, is_same_or_inside

MAX_TREE_ENTRIES = 2000
MAX_READ_BYTES = 1024 * 1024
MAX_WRITE_BYTES = 1024 * 1024
MAX_SEARCH_FILES = 5000
MAX_SEARCH_FILE_BYTES = 1024 * 1024
MAX_SEARCH_SECONDS = 3.0
MAX_PREVIEW_CHARS = 200


def hash_bytes_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def to_project_relative(project_root: str, canonical: str) -> str:
    relative = os.path.relpath(canonical, project_root)
    return "" if relative == "." else relative.replace(os.sep, "/")


def resolve_project_path(guard: WorkspaceAccessGuard, project_root: str, path: str) -> str:
    # Security: every file the UI touches resolves through the workspace guard (traversal,
    # symlink escapes, sensitive files) and must also stay inside this project's folder.
    path = path or ""
    if "\x00" in path or os.path.isabs(path) or path.startswith("~"):
        raise ProjectError(400, "invalid_path", "use a path relative to the project")
    requested = os.path.normpath(path).replace(os.sep, "/")
    if requested != "." and WorkspaceAccessGuard.is_sensitive_path(requested, requested):
        raise ProjectError(403, "sensitive_path", "OWL doesn't open files that hold secrets")
    try:
        canonical = guard.resolve_authorized_path(os.path.join(project_root, path))
    except WorkspaceError as exc:
        if "sensitive" in str(exc):
            raise ProjectError(
                403, "sensitive_path", "OWL doesn't open files that hold secrets"
            ) from exc
        raise ProjectError(403, "path_outside_project", "that path is outside the project") from exc
    if not is_same_or_inside(canonical, project_root):
        raise ProjectError(403, "path_outside_project", "that path is outside the project")
    return canonical


def is_hidden_from_listing(
    guard: WorkspaceAccessGuard, project_root: str, relative: str, full_path: str
) -> bool:
    if WorkspaceAccessGuard.is_sensitive_path(relative, full_path):
        return True
    if os.path.islink(full_path):
        target = os.path.realpath(full_path)
        if not is_same_or_inside(target, project_root):
            return True
        if WorkspaceAccessGuard.is_sensitive_path(
            to_project_relative(project_root, target), target
        ):
            return True
    return False


def build_tree_entry(entry: os.DirEntry, relative: str, ignored: bool) -> dict:
    is_dir = entry.is_dir(follow_symlinks=True)
    size = 0
    if not is_dir:
        try:
            size = entry.stat(follow_symlinks=True).st_size
        except OSError:
            size = 0
    return {
        "name": entry.name,
        "path": relative,
        "type": "directory" if is_dir else "file",
        "symlink": entry.is_symlink(),
        "size": size,
        "ignored": ignored,
    }


def list_project_tree(
    guard: WorkspaceAccessGuard, project_root: str, path: str = "", include_ignored: bool = False
) -> dict:
    canonical = resolve_project_path(guard, project_root, path)
    if not os.path.exists(canonical):
        raise ProjectError(404, "path_not_found", "that folder doesn't exist")
    if not os.path.isdir(canonical):
        raise ProjectError(422, "not_a_directory", "that path is a file")
    matcher = GitIgnoreMatcher(project_root)
    base = to_project_relative(project_root, canonical)
    entries: list[dict] = []
    hidden = {"ignored": 0, "sensitive": 0}
    truncated = False
    with os.scandir(canonical) as listing:
        for entry in listing:
            relative = f"{base}/{entry.name}" if base else entry.name
            if entry.name in ALWAYS_HIDDEN_NAMES:
                continue
            if is_hidden_from_listing(guard, project_root, relative, entry.path):
                hidden["sensitive"] += 1
                continue
            ignored = matcher.is_ignored(relative, entry.is_dir(follow_symlinks=True))
            if ignored and not include_ignored:
                hidden["ignored"] += 1
                continue
            if len(entries) >= MAX_TREE_ENTRIES:
                truncated = True
                break
            entries.append(build_tree_entry(entry, relative, ignored))
    entries.sort(key=lambda e: (e["type"] != "directory", e["name"].casefold()))
    return {"path": base, "entries": entries, "truncated": truncated, "hidden": hidden}


def read_text_bytes_or_refuse(data: bytes) -> str:
    if b"\x00" in data[:8192]:
        raise ProjectError(422, "binary_file", "this file isn't text")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ProjectError(422, "binary_file", "this file isn't UTF-8 text") from exc


def read_project_file(guard: WorkspaceAccessGuard, project_root: str, path: str) -> dict:
    canonical = resolve_project_path(guard, project_root, path)
    if not os.path.exists(canonical):
        raise ProjectError(404, "path_not_found", "that file doesn't exist")
    if not os.path.isfile(canonical):
        raise ProjectError(422, "not_a_file", "that path is a folder")
    size = os.path.getsize(canonical)
    if size > MAX_READ_BYTES:
        raise ProjectError(
            413, "file_too_large", "this file is too large to open", size=size, limit=MAX_READ_BYTES
        )
    with open(canonical, "rb") as fh:
        data = fh.read(MAX_READ_BYTES + 1)
    content = read_text_bytes_or_refuse(data)
    return {
        "path": to_project_relative(project_root, canonical),
        "content": content,
        "size": len(data),
        "sha256": hash_bytes_sha256(data),
    }


def write_file_atomically(canonical: str, data: bytes, mode: int | None) -> None:
    folder = os.path.dirname(canonical)
    fd, temporary = tempfile.mkstemp(prefix=".owl-save-", dir=folder)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        if mode is not None:
            os.chmod(temporary, mode)
        os.replace(temporary, canonical)
    except OSError:
        if os.path.exists(temporary):
            os.remove(temporary)
        raise


def save_user_file(
    conn: sqlite3.Connection,
    guard: WorkspaceAccessGuard,
    project: dict,
    path: str,
    content: str,
    base_sha256: str | None = None,
    create: bool = False,
) -> dict:
    data = content.encode("utf-8")
    if len(data) > MAX_WRITE_BYTES:
        raise ProjectError(413, "file_too_large", "this file is too large to save")
    root = project["path"]
    canonical = resolve_project_path(guard, root, path)
    if os.path.isdir(canonical):
        raise ProjectError(422, "not_a_file", "that path is a folder")
    exists = os.path.isfile(canonical)
    if not exists and not create:
        raise ProjectError(404, "path_not_found", "that file doesn't exist")
    if not exists and not os.path.isdir(os.path.dirname(canonical)):
        raise ProjectError(404, "parent_not_found", "the folder for this file doesn't exist")
    before_bytes = b""
    mode = None
    if exists:
        with open(canonical, "rb") as fh:
            before_bytes = fh.read(MAX_WRITE_BYTES + 1)
        read_text_bytes_or_refuse(before_bytes)
        mode = stat.S_IMODE(os.stat(canonical).st_mode)
        current = hash_bytes_sha256(before_bytes)
        if base_sha256 and base_sha256 != current:
            raise ProjectError(
                409,
                "file_changed",
                "the file changed on disk since you opened it",
                current_sha256=current,
            )
    try:
        write_file_atomically(canonical, data, mode)
    except OSError as exc:
        raise ProjectError(500, "write_failed", f"could not save the file: {exc.strerror}") from exc
    journal_id = create_prefixed_id("chg")
    conn.execute(
        "INSERT INTO change_journal (id, task_id, path, before_text, after_text, approval_id,"
        " applied_at, source, project_id) VALUES (?, '', ?, ?, ?, '', ?, 'user', ?)",
        (
            journal_id,
            canonical,
            before_bytes.decode("utf-8"),
            content,
            current_utc_time().isoformat(),
            project["id"],
        ),
    )
    conn.commit()
    return {
        "path": to_project_relative(root, canonical),
        "bytes": len(data),
        "sha256": hash_bytes_sha256(data),
        "journal_id": journal_id,
        "created": not exists,
        "source": "user",
    }


def search_lines_of_file(full_path: str, relative: str, needle: str, out: list, limit: int) -> None:
    with open(full_path, "rb") as fh:
        data = fh.read(MAX_SEARCH_FILE_BYTES + 1)
    if len(data) > MAX_SEARCH_FILE_BYTES or b"\x00" in data[:8192]:
        return
    text = data.decode("utf-8", errors="replace")
    for number, line in enumerate(text.splitlines(), start=1):
        if needle in line.casefold():
            preview = line.strip()[:MAX_PREVIEW_CHARS]
            out.append({"path": relative, "line": number, "preview": preview, "kind": "content"})
            if len(out) >= limit:
                return


def search_project_files(
    guard: WorkspaceAccessGuard, project_root: str, query: str, limit: int = 50
) -> dict:
    needle = (query or "").strip().casefold()
    if not needle or len(needle) > 200:
        raise ProjectError(422, "invalid_query", "search text must be 1 to 200 characters")
    matcher = GitIgnoreMatcher(project_root)
    results: list[dict] = []
    scanned = 0
    truncated = False
    deadline = time.monotonic() + MAX_SEARCH_SECONDS
    for folder, dirnames, filenames in os.walk(project_root):
        base = to_project_relative(project_root, folder)
        kept = []
        for name in sorted(dirnames):
            relative = f"{base}/{name}" if base else name
            full = os.path.join(folder, name)
            if name in ALWAYS_HIDDEN_NAMES or os.path.islink(full):
                continue
            if is_hidden_from_listing(guard, project_root, relative, full):
                continue
            if not matcher.is_ignored(relative, True):
                kept.append(name)
        dirnames[:] = kept
        for name in sorted(filenames):
            if len(results) >= limit or scanned >= MAX_SEARCH_FILES:
                truncated = True
                break
            if time.monotonic() > deadline:
                truncated = True
                break
            relative = f"{base}/{name}" if base else name
            full = os.path.join(folder, name)
            if is_hidden_from_listing(guard, project_root, relative, full):
                continue
            if matcher.is_ignored(relative, False):
                continue
            scanned += 1
            if needle in name.casefold():
                results.append({"path": relative, "line": 0, "preview": name, "kind": "name"})
            try:
                search_lines_of_file(os.path.realpath(full), relative, needle, results, limit)
            except OSError:
                continue
        if truncated:
            break
    return {
        "query": query,
        "results": results[:limit],
        "truncated": truncated or len(results) > limit,
        "files_scanned": scanned,
    }
