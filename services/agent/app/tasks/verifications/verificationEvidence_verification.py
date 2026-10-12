from __future__ import annotations

import json
import os
import sqlite3

from ..taskRule_task import MUTATING_TOOLS


class VerificationEvidenceMixin:
    def find_last_change_time(self, task_id: str) -> str:
        # Security: timestamp of the last thing that could have changed the workspace
        # ('' if none). Any verification run older than this proves nothing.
        journal = self.conn.execute(
            "SELECT max(applied_at), max(reverted_at) FROM change_journal WHERE task_id = ?",
            (task_id,),
        ).fetchone()
        marks = [m for m in (journal[0], journal[1]) if m] if journal else []
        placeholders = ",".join("?" for _ in MUTATING_TOOLS)
        tool = self.conn.execute(
            f"SELECT max(created_at) FROM tool_calls WHERE task_id = ? AND status = 'ok'"
            f" AND tool IN ({placeholders})",
            (task_id, *sorted(MUTATING_TOOLS)),
        ).fetchone()
        if tool and tool[0]:
            marks.append(tool[0])
        row = self.fetch_task_row(task_id)
        if row is not None and row["reverify_after"]:
            marks.append(row["reverify_after"])
        return max(marks) if marks else ""

    def find_passed_requirement_ids(self, task_id: str, reqs, since: str) -> set[str]:
        # Security: a pass only counts for the exact argv and working directory that ran
        # after `since`, so a different command can never stand in for the required one.
        passed: set[str] = set()
        for req in reqs:
            cwd = self.resolve_requirement_directory(task_id, req.cwd)
            row = self.conn.execute(
                "SELECT id FROM verification_runs WHERE task_id = ? AND requirement_id = ?"
                " AND status = 'passed' AND exit_code = 0 AND command_json = ?"
                " AND working_directory = ? AND started_at > ? LIMIT 1",
                (task_id, req.id, json.dumps(list(req.argv)), cwd, since),
            ).fetchone()
            if row:
                passed.add(req.id)
        return passed

    def resolve_requirement_directory(self, task_id: str, cwd: str) -> str:
        base = self.read_task_workspace(task_id)
        return os.path.normpath(os.path.join(base, cwd)) if base else cwd

    def list_changed_workspace_paths(self, task_id: str, workspace: str) -> list[str]:
        # Security: workspace-relative files this task changed (unreverted), used to warn when
        # a task rewrote what a check runs. package.json only counts when "scripts" changed.
        rows = self.conn.execute(
            "SELECT path, before_text FROM change_journal WHERE task_id = ?"
            " AND reverted_at IS NULL ORDER BY applied_at",
            (task_id,),
        ).fetchall()
        first_before: dict[str, str] = {}
        for r in rows:
            first_before.setdefault(r["path"], r["before_text"] or "")
        out: list[str] = []
        for path, before in first_before.items():
            try:
                full = (
                    self.workspace_guard.resolve_authorized_path(path)
                    if self.workspace_guard is not None
                    else path
                )
            except Exception:  # noqa: BLE001 - unresolvable paths can't influence checks
                continue
            rel = os.path.relpath(full, workspace)
            if rel.startswith(".."):
                continue
            if os.path.basename(rel) == "package.json":
                try:
                    with open(full, encoding="utf-8") as fh:
                        now = json.load(fh).get("scripts", {})
                    was = json.loads(before).get("scripts", {}) if before.strip() else None
                except (OSError, ValueError, AttributeError):
                    now, was = None, {}
                if now == was:
                    continue
            out.append(rel)
        return out

    def latest_verification_runs(self, task_id: str) -> list[sqlite3.Row]:
        top = self.conn.execute(
            "SELECT max(attempt) FROM verification_runs WHERE task_id = ?", (task_id,)
        ).fetchone()
        if not top or top[0] is None:
            return []
        return self.conn.execute(
            "SELECT * FROM verification_runs WHERE task_id = ? AND attempt = ? ORDER BY started_at",
            (task_id, top[0]),
        ).fetchall()
