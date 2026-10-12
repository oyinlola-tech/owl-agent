from __future__ import annotations

import json
import os
import sqlite3

from ..databases.recordStamp_database import create_prefixed_id, current_utc_time
from ..guards.workspaceAccess_guard import WorkspaceAccessGuard
from .projectLocation_project import (
    ProjectError,
    detect_project_stack,
    validate_project_folder,
)

MAX_PROJECT_NAME_LENGTH = 120
MAX_HISTORY_ROWS = 200


def convert_project_row(row: sqlite3.Row) -> dict:
    try:
        stack = json.loads(row["stack"] or "{}")
    except ValueError:
        stack = {}
    return {
        "id": row["id"],
        "name": row["name"],
        "path": row["path"],
        "stack": stack,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_opened_at": row["last_opened_at"],
        "exists": os.path.isdir(row["path"]),
    }


def clean_project_name(name: str, fallback: str) -> str:
    cleaned = " ".join((name or "").split())[:MAX_PROJECT_NAME_LENGTH]
    return cleaned or fallback


class ProjectStore:
    def __init__(
        self, conn: sqlite3.Connection, guards: list[WorkspaceAccessGuard], data_root: str
    ) -> None:
        self.conn = conn
        self.guards = guards
        self.data_root = data_root

    def authorize_root_in_every_guard(self, path: str) -> None:
        for guard in self.guards:
            guard.add_authorized_root(path)

    def withdraw_root_from_every_guard(self, path: str) -> None:
        for guard in self.guards:
            guard.remove_authorized_root(path)

    def sync_authorized_project_roots(self) -> list[str]:
        saved = [r["path"] for r in self.conn.execute("SELECT path FROM projects").fetchall()]
        for guard in self.guards:
            for root in list(guard.list_roots()):
                if root not in saved:
                    guard.remove_authorized_root(root)
        restored = []
        for path in saved:
            if os.path.isdir(path):
                self.authorize_root_in_every_guard(path)
                restored.append(path)
        return restored

    def list_projects(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM projects ORDER BY COALESCE(last_opened_at, created_at) DESC, name"
        ).fetchall()
        return [convert_project_row(r) for r in rows]

    def get_project(self, project_id: str) -> dict:
        row = self.conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise ProjectError(404, "project_not_found", "no project with that id")
        project = convert_project_row(row)
        if not project["exists"]:
            raise ProjectError(410, "project_folder_missing", "the project folder no longer exists")
        return project

    def add_project(self, path: str, name: str = "") -> tuple[dict, bool]:
        canonical = validate_project_folder(path, self.data_root)
        existing = self.conn.execute(
            "SELECT * FROM projects WHERE path = ?", (canonical,)
        ).fetchone()
        if existing is not None:
            self.authorize_root_in_every_guard(canonical)
            return convert_project_row(existing), False
        stack = detect_project_stack(canonical)
        now = current_utc_time().isoformat()
        project_id = create_prefixed_id("prj")
        self.conn.execute(
            "INSERT INTO projects (id, name, path, stack, created_at, updated_at, last_opened_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                project_id,
                clean_project_name(name, os.path.basename(canonical)),
                canonical,
                json.dumps(stack),
                now,
                now,
                now,
            ),
        )
        self.conn.commit()
        self.authorize_root_in_every_guard(canonical)
        return self.get_project(project_id), True

    def refresh_project_stack(self, project_id: str) -> dict:
        project = self.get_project(project_id)
        stack = detect_project_stack(project["path"])
        self.conn.execute(
            "UPDATE projects SET stack = ? WHERE id = ?", (json.dumps(stack), project_id)
        )
        self.conn.commit()
        return {**project, "stack": stack}

    def update_project(
        self, project_id: str, name: str | None = None, opened: bool = False
    ) -> dict:
        row = self.conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise ProjectError(404, "project_not_found", "no project with that id")
        now = current_utc_time().isoformat()
        if name is not None:
            cleaned = clean_project_name(name, "")
            if not cleaned:
                raise ProjectError(422, "invalid_name", "the project name can't be empty")
            self.conn.execute(
                "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
                (cleaned, now, project_id),
            )
        if opened:
            self.conn.execute(
                "UPDATE projects SET last_opened_at = ? WHERE id = ?", (now, project_id)
            )
        self.conn.commit()
        updated = self.conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return convert_project_row(updated)

    def forget_project(self, project_id: str) -> dict:
        # Security: forgetting only removes OWL's record and access grant; the folder and its
        # files are never touched.
        row = self.conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise ProjectError(404, "project_not_found", "no project with that id")
        self.conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        self.conn.commit()
        self.withdraw_root_from_every_guard(row["path"])
        return {"forgotten": True, "id": project_id, "path": row["path"], "files_deleted": False}


def insert_command_row(conn: sqlite3.Connection, prepared: dict, status: str, error: str) -> None:
    conn.execute(
        "INSERT INTO command_runs (id, project_id, command, argv_json, cwd, status, risk,"
        " risk_reason, sandboxed, sandbox_backend, network, error, started_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            prepared["run_id"],
            prepared["project_id"],
            prepared["command"],
            json.dumps(prepared["argv"]),
            prepared["cwd"],
            status,
            prepared["risk"],
            prepared["risk_reason"],
            prepared.get("sandboxed"),
            prepared.get("sandbox_backend", ""),
            int(bool(prepared.get("network"))),
            error,
            current_utc_time().isoformat(),
        ),
    )
    conn.commit()


def finish_command_row(conn: sqlite3.Connection, run_id: str, **fields: object) -> None:
    fields["completed_at"] = current_utc_time().isoformat()
    columns = ", ".join(f"{name} = ?" for name in fields)
    conn.execute(f"UPDATE command_runs SET {columns} WHERE id = ?", (*fields.values(), run_id))
    conn.commit()


def list_command_history(conn: sqlite3.Connection, project_id: str, limit: int = 50) -> list[dict]:
    limit = min(max(int(limit), 1), MAX_HISTORY_ROWS)
    rows = conn.execute(
        "SELECT * FROM command_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?",
        (project_id, limit),
    ).fetchall()
    history = []
    for row in rows:
        item = dict(row)
        item["argv"] = json.loads(item.pop("argv_json") or "[]")
        item["truncated"] = bool(item["truncated"])
        item["network"] = bool(item["network"])
        item["sandboxed"] = None if item["sandboxed"] is None else bool(item["sandboxed"])
        history.append(item)
    return history


def recover_interrupted_commands(conn: sqlite3.Connection) -> int:
    cursor = conn.execute(
        "UPDATE command_runs SET status = 'interrupted', completed_at = ? WHERE status = 'running'",
        (current_utc_time().isoformat(),),
    )
    conn.commit()
    return cursor.rowcount
