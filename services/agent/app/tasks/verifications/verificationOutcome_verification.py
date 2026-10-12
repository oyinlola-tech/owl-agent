from __future__ import annotations

import json

from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...schemas.approval_schema import ApprovalState
from ...schemas.task_schema import TaskStatus


class VerificationOutcomeMixin:
    async def verify_and_finish_task(
        self, task_id: str, model: str, observations: list[str]
    ) -> str:
        # Security: the model's "done" is only a claim. Only runs that this runtime executed,
        # persisted, and saw pass (exit code 0, after the last change) can verify a task.
        text = await self.call_model_with_retries(
            task_id,
            [
                {
                    "role": "user",
                    "content": (
                        "VERIFY. All planned steps are done. Reply with ONLY JSON: "
                        '{"done": true, "summary": "..."} or {"done": false, "note": "..."}. '
                        f"Objective: {self.read_task_objective(task_id)[:1000]}"
                    ),
                }
            ],
            model,
            "verify",
        )
        parsed = self.parse_first_json_object_in_text(text) or {}
        claim = str(parsed.get("summary") or parsed.get("note") or "Work finished.")[:500]
        outcome, detail = await self.run_verification_round(task_id)

        if outcome == "verified":
            lines = self.build_verification_checklist(task_id)
            summary = f"{claim}\nVerification:\n{lines}\nStatus: Verified"
            await self.finish_task(task_id, TaskStatus.VERIFIED_COMPLETED, summary, note="")
            await self.save_checkpoint(task_id, "verification-completed")
            await self.bus.publish_event(task_id, "verification.completed", {"verified": True})
            await self.announce_task_completion(task_id, summary, verified=True)
            return "done"

        if outcome == "unverified":
            summary = f"{claim}\nVerification:\n{detail}\nStatus: Completed, not verified"
            await self.finish_task(task_id, TaskStatus.COMPLETED_UNVERIFIED, summary, note=detail)
            await self.bus.publish_event(
                task_id, "verification.completed", {"verified": False, "reason": detail}
            )
            await self.announce_task_completion(task_id, summary, verified=False, reason=detail)
            return "done"

        if outcome == "blocked":
            self.update_task_fields(task_id, verification_note=detail)
            self.pause_task_with_note(task_id, detail)
            await self.bus.publish_event(task_id, "task.paused", {"reason": detail})
            return "stopped"

        return await self.add_fix_step_or_fail(task_id, detail, observations)

    async def add_fix_step_or_fail(self, task_id: str, detail: str, observations: list[str]) -> str:
        failed = [v for v in self.latest_verification_runs(task_id) if v["status"] != "passed"]
        await self.save_checkpoint(task_id, "verification-failed")
        row = self.fetch_task_row(task_id)
        attempts = int(row["verification_attempts"]) if row else 0
        first = failed[0] if failed else None
        await self.bus.publish_event(
            task_id,
            "verification.failed",
            {
                "attempt": attempts,
                "max_attempts": self.max_verification_attempts,
                "kind": first["kind"] if first else "",
                "command": " ".join(json.loads(first["command_json"])) if first else "",
                "status": first["status"] if first else "",
                "exit_code": first["exit_code"] if first else None,
            },
        )
        if attempts >= self.max_verification_attempts:
            note = (
                f"Verification still failing after {attempts} attempts. "
                "Fix the problem, then resume to verify again."
            )
            self.update_task_fields(task_id, verification_note=note)
            self.set_task_status(task_id, TaskStatus.FAILED)
            self.add_system_note(task_id, note)
            await self.bus.publish_event(task_id, "task.failed", {"reason": note})
            return "stopped"
        for v in failed:
            observations.append(self.describe_failed_run_for_model(v))
        steps = self.read_plan_steps(task_id)
        label = (
            f"Fix failing {first['kind']}: {' '.join(json.loads(first['command_json']))}"
            if first
            else "Fix failing verification"
        )
        steps.append({"title": label[:200], "status": "pending", "until_done": True})
        self.save_plan_steps(task_id, steps)
        self.update_task_fields(task_id, verification_note=detail)
        self.add_system_note(task_id, "OWL is reviewing the actual error output before continuing.")
        await self.bus.publish_event(task_id, "step.added", {"title": label[:200]})
        return "retry"

    async def finish_task(self, task_id: str, status: TaskStatus, summary: str, note: str) -> None:
        self.set_step_and_progress(task_id, max(self.current_step_index(task_id), 1), 100)
        await self.publish_progress(task_id, 100, "Done")
        await self.save_checkpoint(task_id, "final")
        fields: dict = {"status": status.value, "verification_note": note}
        if status == TaskStatus.VERIFIED_COMPLETED:
            fields["verified_at"] = current_utc_time().isoformat()
        self.update_task_fields(task_id, **fields)
        self.conn.execute(
            "INSERT INTO messages (id, task_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                create_prefixed_id("msg"),
                task_id,
                "assistant",
                summary,
                current_utc_time().isoformat(),
            ),
        )
        self.conn.commit()

    async def announce_task_completion(
        self, task_id: str, summary: str, *, verified: bool, reason: str = ""
    ) -> None:
        await self.bus.publish_event(
            task_id,
            "task.completed",
            {"summary": summary, "verified": verified, "reason": reason},
        )
        await self.update_memory_after_completion(task_id)

    async def update_memory_after_completion(self, task_id: str) -> None:
        try:
            row = self.fetch_task_row(task_id)
            if row is None:
                return
            decided = [
                f"{a.title} ({a.status.value})"
                for a in self.list_task_approvals(task_id)
                if a.status != ApprovalState.PENDING
            ]
            self.memory.save_memory(
                "task",
                f"Task '{row['prompt'][:200]}' completed. Decisions: {decided or 'none'}.",
                project=row["project"],
                source=f"task:{task_id}",
            )
            summary = f"Latest work: {row['prompt'][:200]} (status {row['status']})."
            existing = self.memory.search_memories(
                "project summary", project=row["project"], limit=5
            )
            prior = next(
                (m for m in existing if m["source"] == f"project-summary:{row['project']}"), None
            )
            if prior:
                self.memory.update_memory_text(prior["id"], summary)
            else:
                self.memory.save_memory(
                    "project",
                    summary,
                    project=row["project"],
                    source=f"project-summary:{row['project']}",
                )
            await self.bus.publish_event(task_id, "memory.updated", {"project": row["project"]})
        except Exception:  # noqa: BLE001 - maintenance must never fail a task
            pass
