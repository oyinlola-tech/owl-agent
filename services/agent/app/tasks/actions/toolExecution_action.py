from __future__ import annotations

import json
import time

from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...executors.browserExecutor_executor import BrowserError
from ...executors.commandExecutor_executor import CommandError
from ...executors.fileChange_executor import ChangeError
from ...executors.gitExecutor_executor import GitError
from ...guards.approvalBinding_guard import (
    find_usable_approval_for_action,
    hash_action_with_arguments,
    mark_approval_consumed,
)
from ...guards.commandRisk_guard import assess_command_risk
from ...guards.workspaceAccess_guard import WorkspaceError
from ...tools.toolError_tool import ToolError
from ...tools.toolRegistry_tool import REGISTERED_TOOLS, TOOL_HANDLERS
from ..taskRule_task import ToolApprovalNeededError, ToolCallFailedError


class ToolExecutionMixin:
    async def execute_tool_with_approval_check(
        self, task_id: str, tool_name: str, args: dict, why: str
    ) -> dict:
        tool = REGISTERED_TOOLS.get(tool_name)
        if tool is None:
            raise ToolCallFailedError(f"unknown tool '{tool_name}'")
        try:
            validated = tool.arguments_model(**args)
        except Exception as exc:
            raise ToolCallFailedError(f"invalid arguments for {tool_name}: {exc}") from exc
        canon = validated.model_dump(mode="json")
        digest = hash_action_with_arguments(tool_name, canon)
        if tool.requires_approval:
            if tool_name == "exec_run":
                verdict, why_refused = assess_command_risk(list(canon.get("argv", [])))
                if verdict == "refused":
                    self.record_tool_call(
                        task_id,
                        tool_name,
                        canon,
                        "",
                        "error",
                        None,
                        f"refused: {why_refused}",
                        digest,
                    )
                    raise ToolCallFailedError(f"refused: {why_refused}")
            row, _reason = find_usable_approval_for_action(self.conn, task_id, tool_name, canon)
            if row is None:
                dup = self.conn.execute(
                    "SELECT id FROM tool_calls WHERE task_id = ? AND tool = ? AND status = 'ok'"
                    " AND output_excerpt LIKE ?",
                    (task_id, tool_name, f"%{digest}%"),
                ).fetchone()
                if dup:
                    return {"skipped": "duplicate", "note": "identical action already applied"}
                raise ToolApprovalNeededError(tool_name, canon, why)
            approval = dict(row)
            if approval.get("scope") != "task":
                dup = self.conn.execute(
                    "SELECT id FROM tool_calls WHERE task_id = ? AND tool = ? AND status = 'ok'"
                    " AND output_excerpt LIKE ?",
                    (task_id, tool_name, f"%{digest}%"),
                ).fetchone()
                if dup:
                    return {"skipped": "duplicate", "note": "identical action already applied"}
        else:
            approval = {}
        started = time.monotonic()
        sandbox_state: dict = {}
        try:
            result = await self.call_tool_handler(task_id, tool_name, validated, approval)
            if isinstance(result, dict) and "sandboxed" in result:
                sandbox_state = {
                    "sandboxed": bool(result["sandboxed"]),
                    "sandbox_backend": str(result.get("sandbox_backend", "none")),
                }
            status, excerpt = "ok", str(result)[:800]
            # Security: record what the process actually returned, never an assumed 0.
            exit_code = (
                result.get("exit_code")
                if tool_name == "exec_run" and isinstance(result, dict)
                else 0
            )
        except (
            ToolError,
            CommandError,
            ChangeError,
            GitError,
            BrowserError,
            WorkspaceError,
        ) as exc:
            status, exit_code, excerpt = "error", None, f"{type(exc).__name__}: {exc}"
        duration = int((time.monotonic() - started) * 1000)
        runs_command = tool_name == "exec_run" or tool_name.startswith("git_")
        if runs_command and not sandbox_state and self.command_executor is not None:
            sandbox_state = self.command_executor.describe_sandbox()
        self.record_tool_call(
            task_id,
            tool_name,
            canon,
            str(approval.get("id", "")),
            status,
            exit_code,
            excerpt,
            digest,
            duration=duration,
            sandbox_state=sandbox_state,
        )
        if sandbox_state and not sandbox_state["sandboxed"]:
            await self.bus.publish_event(
                task_id, "security.unsandboxed", {"tool": tool_name, "status": status}
            )
        if tool.requires_approval and approval.get("scope") != "task":
            mark_approval_consumed(self.conn, str(approval.get("id", "")))
        await self.save_checkpoint(task_id, f"tool:{tool_name}")
        await self.bus.publish_event(
            task_id,
            "tool.result",
            {"tool": tool_name, "status": status, "excerpt": excerpt[:300]},
        )
        if status != "ok":
            raise ToolCallFailedError(excerpt)
        return {"status": status, "result": excerpt[:800]}

    def record_tool_call(
        self,
        task_id: str,
        tool_name: str,
        canon: dict,
        approval_id: str,
        status: str,
        exit_code: int | None,
        excerpt: str,
        digest: str,
        duration: int = 0,
        sandbox_state: dict | None = None,
    ) -> None:
        sandbox_state = sandbox_state or {}
        sandboxed = sandbox_state.get("sandboxed")
        self.conn.execute(
            "INSERT INTO tool_calls (id, task_id, step, tool, args_json, approval_id, status,"
            " exit_code, duration_ms, output_excerpt, created_at, sandboxed, sandbox_backend)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                create_prefixed_id("tool"),
                task_id,
                self.current_step_index(task_id),
                tool_name,
                json.dumps(canon),
                approval_id,
                status,
                exit_code,
                duration,
                f"{digest} {excerpt}"[:864],
                current_utc_time().isoformat(),
                None if sandboxed is None else int(bool(sandboxed)),
                str(sandbox_state.get("sandbox_backend", "")),
            ),
        )
        self.conn.commit()

    async def call_tool_handler(
        self, task_id: str, tool_name: str, validated, approval: dict
    ) -> dict:
        handler = TOOL_HANDLERS[tool_name]
        ctx = {
            "auth": self.workspace_guard,
            "conn": self.conn,
            "task_id": task_id,
            "exec": self.command_executor,
            "browser": self.browser_inspector,
            "provider": self.provider,
            "approval": approval,
        }
        return await handler(ctx, validated)
