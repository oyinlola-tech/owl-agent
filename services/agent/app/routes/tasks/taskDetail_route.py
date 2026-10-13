from __future__ import annotations

import json

from fastapi import APIRouter

from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...executors.fileChange_executor import (
    ChangeConflictError,
    ChangeError,
    list_change_journal,
    revert_journaled_change,
)
from ...guards.workspaceAccess_guard import WorkspaceError
from ...schemas.task_schema import TaskStatus
from ...tasks.taskManager_task import TaskManager
from ..providers.providerErrorResponse_route import build_error_response


def create_task_detail_router(manager: TaskManager) -> APIRouter:
    router = APIRouter()

    @router.post("/tasks/{task_id}/checkpoints", status_code=201)
    async def create_checkpoint(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        label = str(payload.get("label", "manual"))[:120]
        return await manager.save_checkpoint(task_id, label)

    @router.get("/tasks/{task_id}/checkpoints")
    async def list_checkpoints(task_id: str):  # type: ignore[no-untyped-def]
        return manager.list_checkpoints(task_id)

    @router.get("/tasks/{task_id}/detail")
    async def task_detail(task_id: str):  # type: ignore[no-untyped-def]
        task = manager.get_task_or_404(task_id)
        return {
            "task": task,
            "steps": manager.list_plan_steps(task_id),
            "tool_calls": manager.list_tool_calls(task_id),
            "checkpoints": manager.list_checkpoints(task_id),
            "usage": manager.list_task_usage(task_id),
            "verifications": manager.list_verification_runs(task_id),
            "verification": manager.summarize_verification(task_id),
            "memories_used": manager.list_task_memory_uses(task_id),
        }

    @router.put("/tasks/{task_id}/plan")
    async def update_task_plan(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        task = manager.get_task_or_404(task_id)
        # Security: editing a live plan races the worker, so only paused/created tasks
        # may be reordered or rewritten; resume picks the saved plan back up.
        if task.status not in (TaskStatus.CREATED, TaskStatus.PAUSED):
            return build_error_response(409, "Pause the task before editing its plan.", "conflict")
        steps = payload.get("steps")
        if not isinstance(steps, list):
            return build_error_response(422, "steps must be a list of steps.", "validation")
        updated = manager.update_plan_steps(task_id, [s for s in steps if isinstance(s, dict)])
        await manager.save_checkpoint(task_id, "plan-edited")
        await manager.bus.publish_event(task_id, "plan.updated", {"steps": len(updated)})
        return {"task": manager.get_task_or_404(task_id), "steps": updated}

    @router.get("/tasks/{task_id}/bundle")
    async def export_task_bundle(task_id: str):  # type: ignore[no-untyped-def]
        task = manager.get_task_or_404(task_id)
        row = manager.fetch_task_row(task_id)
        journal_rows = manager.conn.execute(
            "SELECT path, before_text, after_text FROM change_journal"
            " WHERE task_id = ? ORDER BY applied_at DESC LIMIT 200",
            (task_id,),
        ).fetchall()
        return {
            "version": 1,
            "exported_at": current_utc_time().isoformat(),
            "prompt": task.prompt,
            "project": task.project,
            "workspace": str(row["workspace"] or "") if row is not None else "",
            "plan": manager.read_plan_steps(task_id),
            "verification_note": task.verification_note,
            "journal": [
                {"path": r["path"], "before": r["before_text"], "after": r["after_text"]}
                for r in reversed(journal_rows)
            ],
            "verification_runs": manager.list_verification_runs(task_id),
            "verification": manager.summarize_verification(task_id),
            "memories_used": manager.list_task_memory_uses(task_id),
        }

    @router.post("/tasks/import", status_code=201)
    async def import_task_bundle(payload: dict):  # type: ignore[no-untyped-def]
        bundle = payload.get("bundle")
        if not isinstance(bundle, dict) or bundle.get("version") != 1:
            return build_error_response(422, "bundle version 1 is required.", "validation")
        prompt = bundle.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            return build_error_response(422, "bundle prompt is required.", "validation")
        plan = bundle.get("plan", [])
        if not isinstance(plan, list):
            return build_error_response(422, "bundle plan must be a list.", "validation")
        project = str(payload.get("project") or bundle.get("project") or "")[:256]
        workspace = str(payload.get("workspace") or bundle.get("workspace") or "").strip()
        if workspace and manager.workspace_guard is not None:
            # Security: an imported bundle names its own workspace, so it must resolve
            # inside currently authorized roots exactly like a newly created task.
            try:
                workspace = manager.workspace_guard.resolve_authorized_path(workspace)
            except WorkspaceError as exc:
                return build_error_response(409, str(exc), "conflict")
        now = current_utc_time().isoformat()
        task_id = create_prefixed_id("task")
        manager.conn.execute(
            "INSERT INTO tasks (id, prompt, project, status, progress,"
            " plan, model, routing, workspace, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, 0, ?, '', 'import', ?, ?, ?)",
            (
                task_id,
                prompt.strip()[:8000],
                project,
                TaskStatus.PAUSED.value,
                json.dumps([]),
                workspace,
                now,
                now,
            ),
        )
        manager.conn.commit()
        manager.update_plan_steps(task_id, [s for s in plan if isinstance(s, dict)])
        # Security: imported verification outcomes are untrusted, so only the plan and
        # prompt carry over; the new task restarts unverified and paused.
        exported_at = bundle.get("exported_at", "unknown time")
        manager.add_system_note(
            task_id,
            f"Imported from a task bundle exported at {exported_at}."
            " Verification outcomes were not carried over; resume to verify.",
        )
        await manager.bus.publish_event(task_id, "task.imported", {"prompt": prompt.strip()[:8000]})
        return manager.get_task_or_404(task_id)

    @router.get("/tasks/{task_id}/tool-calls")
    async def list_tool_calls(task_id: str):  # type: ignore[no-untyped-def]
        manager.get_task_or_404(task_id)
        return manager.list_tool_calls(task_id)

    @router.get("/tasks/{task_id}/journal")
    async def list_journal(task_id: str):  # type: ignore[no-untyped-def]
        manager.get_task_or_404(task_id)
        return list_change_journal(manager.conn, task_id)

    @router.post("/tasks/{task_id}/revert")
    async def revert_journal(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        manager.get_task_or_404(task_id)
        journal_id = str(payload.get("journal_id", ""))[:64]
        if not journal_id:
            return build_error_response(422, "journal_id is required", "validation")
        try:
            result = revert_journaled_change(
                manager.conn, manager.workspace_guard, task_id, journal_id
            )
        except ChangeConflictError as exc:
            return build_error_response(409, str(exc), "conflict")
        except ChangeError as exc:
            return build_error_response(404, str(exc), "not_found")
        await manager.bus.publish_event(task_id, "change.reverted", result)
        return result

    return router
