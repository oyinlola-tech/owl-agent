from __future__ import annotations

import asyncio

from fastapi import HTTPException

from ...contexts.tokenCounter_context import count_tokens
from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...guards.workspaceAccess_guard import WorkspaceError
from ...llms.modelRouter_llm import RoutingError
from ...schemas.approval_schema import ApprovalState
from ...schemas.task_schema import MessageCreate, MessageRead, TaskCreate, TaskRead, TaskStatus
from ..taskRule_task import SYSTEM_INSTRUCTIONS, TERMINAL


class TaskLifecycleMixin:
    async def create_task_and_start(self, payload: TaskCreate, model: str = "auto") -> TaskRead:
        workspace = (payload.workspace or "").strip()
        if workspace and self.workspace_guard is not None:
            try:
                workspace = self.workspace_guard.resolve_authorized_path(workspace)
            except WorkspaceError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        estimated, _ = count_tokens(SYSTEM_INSTRUCTIONS + "\n" + payload.prompt)
        try:
            model_id, reason = self.router.choose_model(
                payload.prompt, model=model, estimated_tokens=estimated
            )
        except RoutingError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        now = current_utc_time().isoformat()
        task_id = create_prefixed_id("task")
        async with self.insert_lock:
            self.conn.execute(
                "INSERT INTO tasks (id, prompt, project, status, progress,"
                " model, routing, workspace, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)",
                (
                    task_id,
                    payload.prompt,
                    payload.project,
                    TaskStatus.RUNNING.value,
                    model_id,
                    reason,
                    workspace,
                    now,
                    now,
                ),
            )
            self.conn.commit()
        await self.bus.publish_event(task_id, "task.started", {"prompt": payload.prompt})
        await self.bus.publish_event(
            task_id, "routing.decided", {"model": model_id, "reason": reason, "requested": model}
        )
        self.running_workers[task_id] = asyncio.create_task(
            self.run_task_from_plan_to_finish(task_id)
        )
        row = self.fetch_task_row(task_id)
        assert row is not None
        return self.build_task_read(row)

    async def cancel_task(self, task_id: str) -> TaskRead:
        self.get_task_or_404(task_id)
        worker = self.running_workers.pop(task_id, None)
        if worker and not worker.done():
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass
        if self.browser_sessions is not None:
            # Security: cancelling a task closes its browser session immediately.
            try:
                await self.browser_sessions.close_task_sessions(task_id)
            except Exception:
                pass
        row = self.fetch_task_row(task_id)
        assert row is not None
        if row["status"] not in TERMINAL:
            self.set_task_status(task_id, TaskStatus.CANCELLED)
            await self.bus.publish_event(task_id, "task.cancelled", {})
        row = self.fetch_task_row(task_id)
        assert row is not None
        return self.build_task_read(row)

    async def pause_task(self, task_id: str) -> TaskRead:
        self.get_task_or_404(task_id)
        self.conn.execute(
            "UPDATE tasks SET status = ? WHERE id = ? AND status = ?",
            (TaskStatus.PAUSED.value, task_id, TaskStatus.RUNNING.value),
        )
        self.conn.commit()
        await self.bus.publish_event(task_id, "task.paused", {})
        return self.get_task_or_404(task_id)

    async def resume_task(self, task_id: str) -> TaskRead:
        record = self.get_task_or_404(task_id)
        if record.status not in (TaskStatus.PAUSED, TaskStatus.FAILED):
            return record
        worker = self.running_workers.get(task_id)
        if worker and not worker.done():
            # Security: a task that is already running is never started twice.
            return record
        if record.status == TaskStatus.FAILED:
            self.update_task_fields(task_id, verification_attempts=0)
        # Security: the user may have edited files by hand before resuming, which OWL can't
        # observe, so earlier verification results (passes and failures) no longer count.
        self.update_task_fields(task_id, reverify_after=current_utc_time().isoformat())
        pending = [
            a for a in self.list_task_approvals(task_id) if a.status == ApprovalState.PENDING
        ]
        self.set_task_status(
            task_id, TaskStatus.AWAITING_APPROVAL if pending else TaskStatus.RUNNING
        )
        await self.bus.publish_event(
            task_id, "task.resumed", {"from_step": self.current_step_index(task_id)}
        )
        self.running_workers[task_id] = asyncio.create_task(
            self.run_task_from_plan_to_finish(task_id)
        )
        return self.get_task_or_404(task_id)

    async def add_task_message(self, task_id: str, payload: MessageCreate) -> MessageRead:
        self.get_task_or_404(task_id)
        msg = MessageRead(
            id=create_prefixed_id("msg"),
            role=payload.role,
            text=payload.text,
            created_at=current_utc_time(),
        )
        self.conn.execute(
            "INSERT INTO messages (id, task_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)",
            (msg.id, task_id, payload.role.value, payload.text, msg.created_at.isoformat()),
        )
        self.update_task_fields(task_id)
        self.conn.commit()
        await self.bus.publish_event(task_id, "message", {"role": msg.role.value, "text": msg.text})
        return msg
