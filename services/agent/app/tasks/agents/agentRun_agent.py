from __future__ import annotations

import asyncio
import time

from ...contexts.contextBudget_context import ContextBudgetPlanner
from ...schemas.task_schema import TaskStatus
from ..taskRule_task import TaskBlockedError, TaskLimitReachedError


class AgentRunMixin:
    async def run_task_from_plan_to_finish(self, task_id: str) -> None:
        started_at = time.monotonic()
        observations: list[str] = [
            f"{tc['tool']} -> {tc['output_excerpt'][:300]}"
            for tc in self.recent_tool_history(task_id)
        ]
        last = self.latest_verification_runs(task_id)
        observations.extend(
            self.describe_failed_run_for_model(v) for v in last if v["status"] != "passed"
        )
        try:
            row = self.fetch_task_row(task_id)
            if row is None:
                return
            model = row["model"] or "mock-1"
            entry = self.registry.get_model(model)
            limit = entry["context_window"] if entry and entry["context_window"] else None
            budgets = ContextBudgetPlanner(
                limit=limit,
                reserve_fraction=self.context_reserve,
                budget_fraction=self.context_budget,
            )
            workspace = (row["workspace"] or "").strip()
            if self.current_step_index(task_id) <= 0:
                await self.plan_task_steps(task_id, row, model, budgets)
            await self.work_and_verify_until_settled(
                task_id, model, workspace, observations, started_at
            )
        except TaskLimitReachedError as exc:
            self.pause_task_with_note(task_id, str(exc))
            await self.bus.publish_event(task_id, "task.paused", {"reason": str(exc)})
        except TaskBlockedError as exc:
            self.pause_task_with_note(task_id, str(exc))
        except Exception as exc:
            self.set_task_status(task_id, TaskStatus.FAILED)
            await self.bus.publish_event(task_id, "task.failed", {"reason": str(exc)[:300]})
        except asyncio.CancelledError:
            if not self.is_shutting_down:
                try:
                    if self.command_executor is not None:
                        await self.command_executor.kill_commands_for_task(task_id)
                except Exception:  # noqa: BLE001 - best effort cleanup
                    pass
                self.set_task_status(task_id, TaskStatus.CANCELLED)
                await self.bus.publish_event(task_id, "task.cancelled", {})
            raise
        finally:
            self.running_workers.pop(task_id, None)

    async def plan_task_steps(self, task_id: str, row, model: str, budgets) -> None:
        parts = self.build_context_parts(task_id, row["prompt"])
        report = budgets.build_budget_report(model, parts)
        await self.bus.publish_event(
            task_id,
            "context.report",
            {
                "used": report.used,
                "limit": report.limit,
                "limit_source": report.limit_source,
                "utilization": report.utilization,
            },
        )
        if report.over_budget or report.should_compress:
            parts, _ = budgets.drop_low_priority_parts_to_fit(model, parts)
            kept, saved = self.compressor.remove_duplicate_parts(parts)
            if saved:
                self.compressor.record_compression(
                    self.conn,
                    task_id,
                    1,
                    report.used,
                    sum(p.tokens for p in kept),
                    "deduped redundant excerpts",
                )
        plan_text = await self.call_model_with_retries(
            task_id,
            [{"role": "user", "content": self.build_plan_prompt(row["prompt"])}],
            model,
            "plan",
        )
        parsed = self.parse_first_json_object_in_text(plan_text)
        titles: list[str] = []
        if parsed:
            for s in parsed.get("plan", [])[:8]:
                title = str(s.get("title", ""))[:200] if isinstance(s, dict) else ""
                if title:
                    titles.append(title)
        if not titles:
            titles = ["Carry out the objective"]
        self.save_plan_steps(task_id, [{"title": t, "status": "pending"} for t in titles])
        await self.publish_progress(task_id, 10, "Plan ready")
        await self.save_checkpoint(task_id, "plan-ready")
        self.set_step_and_progress(task_id, 1, 10)

    async def work_and_verify_until_settled(
        self,
        task_id: str,
        model: str,
        workspace: str,
        observations: list[str],
        started_at: float,
    ) -> None:
        while True:
            await self.work_through_pending_steps(
                task_id, model, workspace, observations, started_at
            )
            if await self.verify_and_finish_task(task_id, model, observations) != "retry":
                return
