from __future__ import annotations

import asyncio
import json

from ...databases.recordStamp_database import current_utc_time
from ...guards.approvalBinding_guard import (
    find_usable_approval_for_action,
    hash_action_with_arguments,
    mark_approval_consumed,
)
from ...requirements import requirementDetection_requirement as requirement_detection
from ...requirements.verificationRequirement_requirement import VERIFICATION_ENVIRONMENT
from ...schemas.approval_schema import ApprovalKind, ApprovalRequest, ApprovalState, Risk
from ...schemas.task_schema import TaskStatus


class VerificationRoundMixin:
    async def run_verification_round(self, task_id: str) -> tuple[str, str]:
        workspace = self.read_task_workspace(task_id)
        since = self.find_last_change_time(task_id)
        if not since:
            self.update_task_fields(task_id, verification_plan="[]")
            return (
                "unverified",
                "OWL didn't change anything in this task, so there was nothing to verify.",
            )
        if self.command_executor is None or not workspace:
            return "unverified", "No authorized workspace to run checks in."
        detection = requirement_detection.detect_verification_requirements(
            workspace, timeout=self.verify_timeout
        )
        changed = self.list_changed_workspace_paths(task_id, workspace)
        taint = {
            r.id: requirement_detection.find_tainting_changes(r, changed)
            for r in detection.requirements
        }
        self.update_task_fields(
            task_id,
            verification_plan=json.dumps(
                [{**r.to_plain_dict(), "tainted_by": taint[r.id]} for r in detection.requirements]
            ),
        )
        runnable = detection.safe_requirements
        if not any(r.required for r in runnable):
            return "unverified", detection.reason or "No required checks could run."
        stale_failure = [
            v
            for v in self.latest_verification_runs(task_id)
            if v["required"] and v["status"] in ("failed", "timeout") and v["started_at"] > since
        ]
        if stale_failure:
            # Security: nothing changed since these checks failed, so rerunning them proves
            # nothing; the round still counts against the budget.
            row = self.fetch_task_row(task_id)
            used = (int(row["verification_attempts"]) if row else 0) + 1
            self.update_task_fields(task_id, verification_attempts=used)
            return "failed", "Nothing changed since the last failed check; make a fix first."
        todo = [
            r
            for r in runnable
            if r.id not in self.find_passed_requirement_ids(task_id, runnable, since)
        ]
        if todo:
            decision = await self.wait_for_verification_approval(task_id, todo, detection, taint)
            if decision == "expired":
                return (
                    "blocked",
                    "The verification request expired before it was approved. "
                    "Resume the task to ask again.",
                )
            if decision != "approved":
                return "blocked", "You declined the verification run, so the task is not verified."
            row = self.fetch_task_row(task_id)
            used = (int(row["verification_attempts"]) if row else 0) + 1
            self.update_task_fields(task_id, verification_attempts=used)
            top = self.conn.execute(
                "SELECT max(attempt) FROM verification_runs WHERE task_id = ?", (task_id,)
            ).fetchone()
            attempt = (int(top[0]) if top and top[0] is not None else 0) + 1
            self.set_task_status(task_id, TaskStatus.RUNNING)
            await self.save_checkpoint(task_id, "verification-started")
            self.add_system_note(
                task_id, "OWL finished the implementation and is independently verifying it."
            )
            await self.bus.publish_event(
                task_id,
                "verification.started",
                {
                    "attempt": attempt,
                    "requirements": [
                        {"id": r.id, "kind": r.kind, "command": r.label, "required": r.required}
                        for r in todo
                    ],
                },
            )
            for req in todo:
                status = await self.run_single_requirement(
                    task_id, req, attempt, VERIFICATION_ENVIRONMENT
                )
                if status != "passed" and req.required:
                    break
        unavailable = [
            v
            for v in self.latest_verification_runs(task_id)
            if v["required"] and v["status"] == "unavailable"
        ]
        if unavailable:
            tool = json.loads(unavailable[0]["command_json"])[0]
            return (
                "unverified",
                f"`{tool}` isn't installed where OWL runs, so it couldn't run "
                f"{' '.join(json.loads(unavailable[0]['command_json']))}.",
            )
        passed = self.find_passed_requirement_ids(task_id, runnable, since)
        missing = [r for r in runnable if r.required and r.id not in passed]
        if not missing:
            return "verified", ""
        names = ", ".join(r.label for r in missing)
        return "failed", f"Required checks not passing: {names}"

    async def wait_for_verification_approval(
        self, task_id: str, todo, detection, taint: dict[str, list[str]]
    ) -> str:
        # Security: one bound approval covers this attempt's exact commands, through the
        # normal approval gate.
        args = {"requirements": [{"id": r.id, "argv": list(r.argv), "cwd": r.cwd} for r in todo]}
        row, _ = find_usable_approval_for_action(self.conn, task_id, "verify_run", args)
        wanted = hash_action_with_arguments("verify_run", args)
        already_asked = any(
            a.action == "verify_run" and a.args_hash == wanted and a.status == ApprovalState.PENDING
            for a in self.list_task_approvals(task_id)
        )
        if row is None and not already_asked:
            skipped = [r for r in detection.requirements if not r.safe]
            warned = [r for r in todo if taint.get(r.id)]
            reason = ""
            if warned:
                files = sorted({f for r in warned for f in taint[r.id]})
                reason += (
                    f"Check carefully: this task changed {', '.join(files)}, which decides what "
                    "these checks run. Approve only if the commands below are what you expect. "
                )
            reason += "Independent verification: OWL runs the project's own checks and records "
            reason += "the real exit codes. "
            reason += "; ".join(f"{r.kind} from {r.detail}" for r in todo)
            if skipped:
                reason += ". Not run: " + "; ".join(
                    f"{r.label} ({r.unsafe_reason})" for r in skipped
                )
            await self.create_approval_request(
                task_id,
                ApprovalRequest(
                    title="Run verification",
                    kind=ApprovalKind.COMMAND,
                    # Security: show what really runs; a script name alone could hide anything.
                    command="\n".join(
                        f"{r.label}  ->  {r.runs}" if r.runs else r.label for r in todo
                    )[:2000],
                    reason=reason[:1000],
                    risk=Risk.LOW,
                    action="verify_run",
                    args=args,
                    scope="once",
                    ttl_seconds=self.approval_ttl,
                ),
            )
        expired = False
        if row is None:
            self.add_system_note(task_id, "waiting on approval to run verification")
            self.set_task_status(task_id, TaskStatus.AWAITING_APPROVAL)
            await self.bus.publish_event(task_id, "task.awaiting_approval", {"verification": True})
            gate = asyncio.Event()
            self.approval_gates[task_id] = gate
            while True:
                row, _ = find_usable_approval_for_action(self.conn, task_id, "verify_run", args)
                if row is not None:
                    break
                mine = [
                    a
                    for a in self.list_task_approvals(task_id)
                    if a.action == "verify_run"
                    and a.args_hash == wanted
                    and a.status == ApprovalState.PENDING
                ]
                if not mine:
                    break
                if all(a.expires_at and a.expires_at < current_utc_time() for a in mine):
                    self.expire_pending_approvals(task_id, [a.id for a in mine])
                    expired = True
                    break
                gate.clear()
                try:
                    await asyncio.wait_for(gate.wait(), timeout=0.5)
                except TimeoutError:
                    pass
            self.approval_gates.pop(task_id, None)
        if row is None:
            return "expired" if expired else "declined"
        # Security: the loser of the consume race treats the approval as unusable.
        if not mark_approval_consumed(self.conn, str(row["id"])):
            return "expired"
        return "approved"
