from __future__ import annotations

import json
import sqlite3

from fastapi import HTTPException

from ...databases.recordStamp_database import current_utc_time
from ...schemas.approval_schema import ApprovalRead
from ...schemas.task_schema import TaskRead, TaskStatus


class TaskRecordMixin:
    def fetch_task_row(self, task_id: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()

    def build_task_read(self, row: sqlite3.Row) -> TaskRead:
        return TaskRead(
            id=row["id"],
            prompt=row["prompt"],
            project=row["project"],
            status=TaskStatus(row["status"]),
            progress=row["progress"],
            message_count=self.conn.execute(
                "SELECT COUNT(*) FROM messages WHERE task_id = ?", (row["id"],)
            ).fetchone()[0],
            model=row["model"],
            routing=row["routing"],
            verification_note=row["verification_note"] or "",
            verified_at=row["verified_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def update_task_fields(self, task_id: str, **fields) -> None:
        fields["updated_at"] = current_utc_time().isoformat()
        sets = ", ".join(f"{k} = ?" for k in fields)
        self.conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", (*fields.values(), task_id))
        self.conn.commit()

    def find_task(self, task_id: str) -> TaskRead | None:
        row = self.fetch_task_row(task_id)
        return self.build_task_read(row) if row else None

    def get_task_or_404(self, task_id: str) -> TaskRead:
        task = self.find_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        return task

    def list_tasks(self) -> list[TaskRead]:
        rows = self.conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
        return [self.build_task_read(r) for r in rows]

    def list_task_approvals(self, task_id: str) -> list[ApprovalRead]:
        self.get_task_or_404(task_id)
        return [
            self.build_approval_read(r)
            for r in self.conn.execute(
                "SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at", (task_id,)
            ).fetchall()
        ]

    @staticmethod
    def build_approval_read(r: sqlite3.Row) -> ApprovalRead:
        return ApprovalRead(
            id=r["id"],
            title=r["title"],
            kind=r["kind"],
            command=r["command"],
            files=json.loads(r["files"] or "[]"),
            reason=r["reason"],
            risk=r["risk"],
            action=r["action"] or "",
            args_hash=r["args_hash"] or "",
            scope=r["scope"] or "once",
            targets=json.loads(r["targets"] or "[]"),
            expires_at=r["expires_at"],
            consumed_at=r["consumed_at"],
            status=r["status"],
            decided_by=r["decided_by"],
            created_at=r["created_at"],
            decided_at=r["decided_at"],
            network=bool(r["network"]),
            sandboxed=None if r["sandboxed"] is None else bool(r["sandboxed"]),
        )

    def current_step_index(self, task_id: str) -> int:
        row = self.fetch_task_row(task_id)
        return int(row["step_index"]) if row else 0

    def set_step_and_progress(self, task_id: str, step: int, progress: int) -> None:
        self.update_task_fields(task_id, step_index=step, progress=progress)

    def set_task_status(self, task_id: str, status: TaskStatus) -> None:
        self.update_task_fields(task_id, status=status.value)
