"""Propose, apply, and revert file changes. Every apply is journaled."""

from __future__ import annotations

import difflib
import hashlib
import os
import sqlite3

from .models import new_id, utcnow
from .workspaces import WorkspaceAuth


class ChangeError(Exception):
    pass


class ConflictError(ChangeError):
    pass


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def _unified(path: str, old: str, new: str) -> str:
    return "".join(
        difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
    )


def propose_edit(
    conn: sqlite3.Connection, task_id: str, auth: WorkspaceAuth, path: str, old: str, new: str
) -> dict:
    canonical = auth.resolve(path)
    if not os.path.isfile(canonical):
        raise ChangeError("file does not exist; create it first")
    with open(canonical, encoding="utf-8", errors="replace") as fh:
        current = fh.read()
    if old not in current:
        raise ChangeError("anchor text not found in current file")
    updated = current.replace(old, new, 1)
    pid = new_id("prop")
    now = utcnow().isoformat()
    conn.execute(
        "INSERT INTO proposals (id, task_id, path, old_text, new_text,"
        " diff, base_sha, status, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?)",
        (pid, task_id, path, old, new, _unified(path, current, updated), _sha(current), now),
    )
    conn.commit()
    return {
        "proposal_id": pid,
        "path": path,
        "diff": _unified(path, current, updated),
        "base_sha": _sha(current),
    }


def apply_edit(
    conn: sqlite3.Connection, task_id: str, auth: WorkspaceAuth, proposal_id: str, approval_id: str
) -> dict:
    row = conn.execute(
        "SELECT * FROM proposals WHERE id = ? AND task_id = ?", (proposal_id, task_id)
    ).fetchone()
    if row is None:
        raise ChangeError("unknown proposal")
    if row["status"] != "proposed":
        raise ChangeError(f"proposal already {row['status']}")
    canonical = auth.resolve(row["path"])
    with open(canonical, encoding="utf-8", errors="replace") as fh:
        current = fh.read()
    if _sha(current) != row["base_sha"]:
        raise ConflictError("file changed since proposal; re-propose instead of overwriting")
    updated = current.replace(row["old_text"], row["new_text"], 1)
    with open(canonical, "w", encoding="utf-8") as fh:
        fh.write(updated)
    jid = new_id("chg")
    now = utcnow().isoformat()
    conn.execute(
        "INSERT INTO change_journal (id, task_id, path, before_text,"
        " after_text, approval_id, applied_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (jid, task_id, row["path"], current, updated, approval_id, now),
    )
    conn.execute("UPDATE proposals SET status = 'applied' WHERE id = ?", (proposal_id,))
    conn.commit()
    return {"journal_id": jid, "path": row["path"], "bytes": len(updated.encode())}


def record_create(conn: sqlite3.Connection, task_id: str, path: str, content: str) -> dict:
    jid = new_id("chg")
    now = utcnow().isoformat()
    conn.execute(
        "INSERT INTO change_journal (id, task_id, path, before_text,"
        " after_text, approval_id, applied_at)"
        " VALUES (?, ?, ?, '', ?, '', ?)",
        (jid, task_id, path, content, now),
    )
    conn.commit()
    return {"journal_id": jid, "path": path}


def revert_change_at(
    conn: sqlite3.Connection, auth: WorkspaceAuth, task_id: str, journal_id: str
) -> dict:
    row = conn.execute(
        "SELECT * FROM change_journal WHERE id = ? AND task_id = ?", (journal_id, task_id)
    ).fetchone()
    if row is None:
        raise ChangeError("unknown journal entry")
    if row["reverted_at"]:
        raise ChangeError("already reverted")
    canonical = auth.resolve(row["path"])
    with open(canonical, encoding="utf-8", errors="replace") as fh:
        current = fh.read()
    if row["before_text"] == "":
        if _sha(current) != _sha(row["after_text"]):
            raise ConflictError("file changed since creation; manual review required")
        os.remove(canonical)
    else:
        if _sha(current) != _sha(row["after_text"]):
            raise ConflictError("file changed since apply; manual review required")
        with open(canonical, "w", encoding="utf-8") as fh:
            fh.write(row["before_text"])
    now = utcnow().isoformat()
    conn.execute("UPDATE change_journal SET reverted_at = ? WHERE id = ?", (now, journal_id))
    conn.commit()
    return {"journal_id": journal_id, "path": row["path"], "reverted_at": now}


def journal_for(conn: sqlite3.Connection, task_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT id, path, approval_id, applied_at, reverted_at,"
        " length(before_text) AS before_bytes, length(after_text) AS after_bytes"
        " FROM change_journal WHERE task_id = ? ORDER BY applied_at",
        (task_id,),
    ).fetchall()
    return [dict(r) for r in rows]
