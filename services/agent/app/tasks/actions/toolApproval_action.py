from __future__ import annotations

import asyncio

from ...guards.approvalBinding_guard import hash_action_with_arguments
from ...guards.commandRisk_guard import assess_command_risk
from ...schemas.approval_schema import ApprovalKind, ApprovalRequest, ApprovalState, Risk
from ...schemas.task_schema import TaskStatus
from ...tools.toolRegistry_tool import REGISTERED_TOOLS
from ..taskRule_task import TaskBlockedError, ToolApprovalNeededError


class ToolApprovalMixin:
    async def execute_tool_waiting_for_approval(
        self, task_id: str, tool_name: str, args: dict, why: str
    ) -> dict:
        attempts = 0
        while True:
            try:
                return await self.execute_tool_with_approval_check(task_id, tool_name, args, why)
            except ToolApprovalNeededError as need:
                attempts += 1
                if attempts > 3:
                    raise TaskBlockedError(
                        "approvals do not match the proposed action after 3 tries"
                    ) from None
                await self.request_tool_approval(task_id, need.tool, need.action_args, need.why)
                self.add_system_note(task_id, f"waiting on approval for {tool_name}")
                self.set_task_status(task_id, TaskStatus.AWAITING_APPROVAL)
                await self.bus.publish_event(task_id, "task.awaiting_approval", {})
                gate = asyncio.Event()
                self.approval_gates[task_id] = gate
                while not gate.is_set():
                    await asyncio.sleep(0.05)
                self.approval_gates.pop(task_id, None)
                decided = [
                    a
                    for a in self.list_task_approvals(task_id)
                    if a.status != ApprovalState.PENDING
                ]
                if decided and decided[-1].status == ApprovalState.EXPIRED:
                    # Security: an approval that arrived too late is never used; ask again.
                    continue
                if not decided or decided[-1].status != ApprovalState.APPROVED:
                    raise TaskBlockedError("approval rejected; step blocked") from None

    async def request_tool_approval(
        self, task_id: str, tool_name: str, args: dict, why: str
    ) -> None:
        tool = REGISTERED_TOOLS.get(tool_name)
        try:
            canon = tool.arguments_model(**args).model_dump(mode="json") if tool else dict(args)
        except Exception:
            canon = dict(args)
        for pending in self.list_task_approvals(task_id):
            if (
                pending.status == ApprovalState.PENDING
                and pending.action == tool_name
                and pending.args_hash == hash_action_with_arguments(tool_name, canon)
            ):
                await self.bus.publish_event(
                    task_id,
                    "tool.called",
                    {"tool": tool_name, "why": why, "risk": "Low", "reused": True},
                )
                return

        risk = Risk.LOW
        kind = ApprovalKind.COMMAND
        title = f"Run {tool_name}"
        command = None
        files: list[str] = []
        if tool_name == "exec_run":
            verdict, _ = assess_command_risk(list(args.get("argv", [])))
            risk = Risk.HIGH if verdict == "high" else Risk.LOW
            command = " ".join(str(a) for a in list(args.get("argv", []))[:12])
            title = "Run command"
        elif tool_name in ("fs_create", "fs_apply_edit"):
            risk, kind = Risk.MEDIUM, ApprovalKind.FILES
            files = [str(args.get("path", ""))]
            title = "Modify file" if tool_name == "fs_apply_edit" else "Create file"
        elif tool_name == "git_commit":
            risk, kind = Risk.MEDIUM, ApprovalKind.FILES
            files = [str(f) for f in list(args.get("files", []))]
            title = "Commit changes"
        elif tool_name == "git_push":
            risk, kind = Risk.HIGH, ApprovalKind.PRIVILEGED
            title = "Push to remote"
        await self.create_approval_request(
            task_id,
            ApprovalRequest(
                title=title,
                kind=kind,
                command=command,
                files=files,
                reason=why or f"Agent requested {tool_name}.",
                risk=risk,
                action=tool_name,
                args=args,
                scope="once",
                ttl_seconds=self.approval_ttl,
            ),
        )
        await self.bus.publish_event(
            task_id, "tool.called", {"tool": tool_name, "why": why, "risk": risk.value}
        )
