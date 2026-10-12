from __future__ import annotations

import json
from datetime import timedelta

from fastapi import HTTPException

from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...guards.approvalBinding_guard import hash_action_with_arguments
from ...guards.commandRisk_guard import command_needs_network
from ...sandboxes.sandboxRunner_sandbox import UNSANDBOXED_NOTE
from ...schemas.approval_schema import (
    ApprovalKind,
    ApprovalRead,
    ApprovalRequest,
    ApprovalState,
    DecisionCreate,
    Risk,
)

COMMAND_ACTIONS = {"exec_run", "git_commit", "git_push", "verify_run"}


class TaskApprovalMixin:
    async def create_approval_request(self, task_id: str, payload: ApprovalRequest) -> ApprovalRead:
        self.get_task_or_404(task_id)
        if payload.scope == "task" and (
            payload.risk != Risk.LOW or payload.kind == ApprovalKind.PRIVILEGED
        ):
            raise HTTPException(
                status_code=422, detail="task scope is only for low-risk, non-privileged actions"
            )
        now = current_utc_time()
        expires = now + timedelta(seconds=payload.ttl_seconds)
        bound = hash_action_with_arguments(payload.action, payload.args) if payload.action else ""
        network, sandboxed, title, reason = self.describe_approval_sandbox(payload)
        targets = sorted(
            {t for t in list(payload.files) + ([payload.command] if payload.command else [])}
        )
        approval = ApprovalRead(
            id=create_prefixed_id("appr"),
            title=title,
            kind=payload.kind,
            command=payload.command,
            files=list(payload.files),
            reason=reason,
            risk=payload.risk,
            action=payload.action,
            args_hash=bound,
            scope=payload.scope,
            targets=targets,
            expires_at=expires,
            status=ApprovalState.PENDING,
            created_at=now,
            network=network,
            sandboxed=sandboxed,
        )
        self.conn.execute(
            """INSERT INTO approvals (id, task_id, title, kind, command, files, reason, risk,
                                      action, args_hash, scope, targets, expires_at,
                                      status, created_at, network, sandboxed)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                approval.id,
                task_id,
                approval.title,
                payload.kind.value,
                approval.command,
                json.dumps(approval.files),
                approval.reason,
                payload.risk.value,
                approval.action,
                approval.args_hash,
                approval.scope,
                json.dumps(approval.targets),
                expires.isoformat(),
                ApprovalState.PENDING.value,
                now.isoformat(),
                1 if network else 0,
                None if sandboxed is None else int(sandboxed),
            ),
        )
        self.update_task_fields(task_id)
        self.conn.commit()
        await self.bus.publish_event(
            task_id, "approval.requested", approval.model_dump(mode="json")
        )
        return approval

    def describe_approval_sandbox(
        self, payload: ApprovalRequest
    ) -> tuple[bool, bool | None, str, str]:
        # Security: network is decided here on the server from the risk assessor, never taken
        # from the request, and the approval text must say so before the user decides.
        title, reason = payload.title, payload.reason
        argv = [str(a) for a in list(payload.args.get("argv", []))]
        network = (payload.action == "exec_run" and command_needs_network(argv)) or (
            payload.action == "git_push"
        )
        if network and "with network access" not in title:
            title = f"{title} with network access"[:200]
        if payload.action not in COMMAND_ACTIONS:
            return network, None, title, reason
        sandbox = getattr(self.command_executor, "sandbox", None)
        note = sandbox.describe_approval_note() if sandbox is not None else UNSANDBOXED_NOTE
        if note:
            reason = f"{reason} This {note}.".strip()[:1000]
        return network, not note, title, reason

    async def record_approval_decision(
        self, task_id: str, approval_id: str, payload: DecisionCreate
    ) -> ApprovalRead:
        self.get_task_or_404(task_id)
        row = self.conn.execute(
            "SELECT * FROM approvals WHERE id = ? AND task_id = ?", (approval_id, task_id)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="approval not found")
        if row["status"] != ApprovalState.PENDING.value:
            raise HTTPException(status_code=409, detail="approval already decided")
        if row["expires_at"] and row["expires_at"] < current_utc_time().isoformat():
            # Security: approving after the deadline must not look like it worked.
            self.conn.execute(
                "UPDATE approvals SET status = 'expired' WHERE id = ?", (approval_id,)
            )
            self.conn.commit()
            gate = self.approval_gates.get(task_id)
            if gate is not None:
                gate.set()
            raise HTTPException(status_code=409, detail="approval expired; resume to ask again")
        state = ApprovalState.APPROVED if payload.approved else ApprovalState.REJECTED
        now = current_utc_time().isoformat()
        self.conn.execute(
            "UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?",
            (state.value, payload.by, now, approval_id),
        )
        self.update_task_fields(task_id)
        self.conn.commit()
        gate = self.approval_gates.get(task_id)
        if gate is not None:
            gate.set()
        await self.bus.publish_event(
            task_id,
            "approval.decided",
            {"id": approval_id, "approved": payload.approved, "by": payload.by},
        )
        await self.save_checkpoint(task_id, "approval-decided")
        updated = self.conn.execute(
            "SELECT * FROM approvals WHERE id = ?", (approval_id,)
        ).fetchone()
        assert updated is not None
        return self.build_approval_read(updated)

    def expire_pending_approvals(self, task_id: str, approval_ids: list[str]) -> None:
        for aid in approval_ids:
            self.conn.execute(
                "UPDATE approvals SET status = 'expired' WHERE id = ? AND task_id = ?"
                " AND status = 'pending'",
                (aid, task_id),
            )
        self.conn.commit()
