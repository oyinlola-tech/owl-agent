from __future__ import annotations

import json
import os
import signal

from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...schemas.task_schema import TaskStatus


def kill_orphaned_verification_process(
    pid: int, argv: list[str], working_directory: str = ""
) -> None:
    # Security: pids get reused, so only kill the process when /proc/<pid>/cmdline still
    # matches the recorded verification command. Sandbox and interpreter wrappers prepend
    # argv elements, so an exact tail match wins first and a cwd-plus-final-command match
    # is the fallback; anything else is left alone.
    if pid <= 0 or not argv:
        return
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as fh:
            running = [p.decode("utf-8", "replace") for p in fh.read().split(b"\0") if p]
    except OSError:
        return
    if not running:
        return
    if running[-len(argv) :] != argv and running != argv:
        if not working_directory:
            return
        try:
            actual_cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            return
        if os.path.realpath(actual_cwd) != os.path.realpath(working_directory):
            return
        if running[-1] != argv[-1]:
            return
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


class TaskCheckpointMixin:
    async def save_checkpoint(self, task_id: str, label: str) -> dict:
        self.get_task_or_404(task_id)
        row = self.fetch_task_row(task_id)
        assert row is not None
        state = {
            "step_index": row["step_index"],
            "progress": row["progress"],
            "model": row["model"],
            "routing": row["routing"],
            "approvals": [
                {"id": a.id, "title": a.title, "status": a.status.value}
                for a in self.list_task_approvals(task_id)
            ],
            "verification": {
                "attempts": row["verification_attempts"],
                "note": row["verification_note"],
                "runs": [
                    {"requirement_id": v["requirement_id"], "status": v["status"]}
                    for v in self.latest_verification_runs(task_id)
                ],
            },
        }
        cid = create_prefixed_id("ckpt")
        self.conn.execute(
            "INSERT INTO checkpoints (id, task_id, label, state,"
            " created_at) VALUES (?, ?, ?, ?, ?)",
            (cid, task_id, label, json.dumps(state), current_utc_time().isoformat()),
        )
        self.conn.commit()
        await self.bus.publish_event(task_id, "checkpoint.created", {"id": cid, "label": label})
        return {"id": cid, "label": label, "state": state}

    def list_checkpoints(self, task_id: str) -> list[dict]:
        self.get_task_or_404(task_id)
        rows = self.conn.execute(
            "SELECT * FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 200",
            (task_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "label": r["label"],
                "state": json.loads(r["state"]),
                "created_at": r["created_at"],
            }
            for r in reversed(rows)
        ]

    def recover_interrupted_tasks(self) -> list[str]:
        # Security: interrupted tasks are paused, never auto-resumed. A check that was mid-run
        # when the service stopped proved nothing; if its process outlived the service, stop it.
        for orphan in self.conn.execute(
            "SELECT pid, command_json, working_directory FROM verification_runs"
            " WHERE status = 'running' AND pid IS NOT NULL"
        ).fetchall():
            kill_orphaned_verification_process(
                int(orphan["pid"]),
                json.loads(orphan["command_json"]),
                str(orphan["working_directory"] or ""),
            )
        self.conn.execute(
            "UPDATE verification_runs SET status = 'interrupted', completed_at = ?,"
            " error = 'The service stopped while this check was running.'"
            " WHERE status = 'running'",
            (current_utc_time().isoformat(),),
        )
        rows = self.conn.execute(
            "SELECT id FROM tasks WHERE status IN ('running','awaiting_approval','paused')"
        ).fetchall()
        recovered = []
        for r in rows:
            self.set_task_status(r["id"], TaskStatus.PAUSED)
            cid = create_prefixed_id("ckpt")
            state = {"step_index": self.current_step_index(r["id"]), "recovered": True}
            self.conn.execute(
                "INSERT INTO checkpoints (id, task_id, label, state,"
                " created_at) VALUES (?, ?, ?, ?, ?)",
                (cid, r["id"], "auto-recovery", json.dumps(state), current_utc_time().isoformat()),
            )
            recovered.append(r["id"])
        self.conn.commit()
        return recovered
