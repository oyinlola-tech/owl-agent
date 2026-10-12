from __future__ import annotations

import difflib
import hashlib
import os
import sqlite3

from ..databases.recordStamp_database import create_prefixed_id, current_utc_time
from ..guards.workspaceAccess_guard import WorkspaceAccessGuard


class ChangeError(Exception):
    pass


class ChangeConflictError(ChangeError):
    pass


def hash_text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def build_unified_diff(path: str, old: str, new: str) -> str:
    return "".join(
        difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
    )


def propose_file_edit(
    conn: sqlite3.Connection,
    task_id: str,
    auth: WorkspaceAccessGuard,
    path: str,
    old: str,
    new: str,
) -> dict:
    canonical = auth.resolve_authorized_path(path)
    if not os.path.isfile(canonical):
        raise ChangeError("file does not exist; create it first")
    with open(canonical, encoding="utf-8", errors="replace") as fh:
        current = fh.read()
    if old not in current:
        raise ChangeError("anchor text not found in current file")
    updated = current.replace(old, new, 1)
    pid = create_prefixed_id("prop")
    now = current_utc_time().isoformat()
    conn.execute(
        "INSERT INTO proposals (id, task_id, path, old_text, new_text,"
        " diff, base_sha, status, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?)",
        (
            pid,
            task_id,
            path,
            old,
            new,
            build_unified_diff(path, current, updated),
            hash_text_sha256(current),
            now,
        ),
    )
    conn.commit()
    return {
        "proposal_id": pid,
        "path": path,
        "diff": build_unified_diff(path, current, updated),
        "base_sha": hash_text_sha256(current),
    }


def apply_proposed_edit(
    conn: sqlite3.Connection,
    task_id: str,
    auth: WorkspaceAccessGuard,
    proposal_id: str,
    approval_id: str,
) -> dict:
    row = conn.execute(
        "SELECT * FROM proposals WHERE id = ? AND task_id = ?", (proposal_id, task_id)
    ).fetchone()
    if row is None:
        raise ChangeError("unknown proposal")
    if row["status"] != "proposed":
        raise ChangeError(f"proposal already {row['status']}")
    canonical = auth.resolve_authorized_path(row["path"])
    with open(canonical, encoding="utf-8", errors="replace") as fh:
        current = fh.read()
    if hash_text_sha256(current) != row["base_sha"]:
        raise ChangeConflictError("file changed since proposal; re-propose instead of overwriting")
    updated = current.replace(row["old_text"], row["new_text"], 1)
    with open(canonical, "w", encoding="utf-8") as fh:
        fh.write(updated)
    jid = create_prefixed_id("chg")
    now = current_utc_time().isoformat()
    conn.execute(
        "INSERT INTO change_journal (id, task_id, path, before_text,"
        " after_text, approval_id, applied_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (jid, task_id, row["path"], current, updated, approval_id, now),
    )
    conn.execute("UPDATE proposals SET status = 'applied' WHERE id = ?", (proposal_id,))
    conn.commit()
    return {"journal_id": jid, "path": row["path"], "bytes": len(updated.encode())}


def journal_file_creation(conn: sqlite3.Connection, task_id: str, path: str, content: str) -> dict:
    jid = create_prefixed_id("chg")
    now = current_utc_time().isoformat()
    conn.execute(
        "INSERT INTO change_journal (id, task_id, path, before_text,"
        " after_text, approval_id, applied_at)"
        " VALUES (?, ?, ?, '', ?, '', ?)",
        (jid, task_id, path, content, now),
    )
    conn.commit()
    return {"journal_id": jid, "path": path}


def revert_journaled_change(
    conn: sqlite3.Connection, auth: WorkspaceAccessGuard, task_id: str, journal_id: str
) -> dict:
    row = conn.execute(
        "SELECT * FROM change_journal WHERE id = ? AND task_id = ?", (journal_id, task_id)
    ).fetchone()
    if row is None:
        raise ChangeError("unknown journal entry")
    if row["reverted_at"]:
        raise ChangeError("already reverted")
    canonical = auth.resolve_authorized_path(row["path"])
    with open(canonical, encoding="utf-8", errors="replace") as fh:
        current = fh.read()
    if row["before_text"] == "":
        if hash_text_sha256(current) != hash_text_sha256(row["after_text"]):
            raise ChangeConflictError("file changed since creation; manual review required")
        os.remove(canonical)
    else:
        if hash_text_sha256(current) != hash_text_sha256(row["after_text"]):
            raise ChangeConflictError("file changed since apply; manual review required")
        with open(canonical, "w", encoding="utf-8") as fh:
            fh.write(row["before_text"])
    now = current_utc_time().isoformat()
    conn.execute("UPDATE change_journal SET reverted_at = ? WHERE id = ?", (now, journal_id))
    conn.commit()
    return {"journal_id": journal_id, "path": row["path"], "reverted_at": now}


def list_change_journal(conn: sqlite3.Connection, task_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT id, path, approval_id, applied_at, reverted_at,"
        " length(before_text) AS before_bytes, length(after_text) AS after_bytes"
        " FROM change_journal WHERE task_id = ? ORDER BY applied_at",
        (task_id,),
    ).fetchall()
    return [dict(r) for r in rows]
