from __future__ import annotations

import time

from ..taskRule_task import TaskBlockedError, TaskLimitReachedError, ToolCallFailedError


class AgentStepMixin:
    async def work_through_pending_steps(
        self,
        task_id: str,
        model: str,
        workspace: str,
        observations: list[str],
        started_at: float,
    ) -> None:
        row = self.fetch_task_row(task_id)
        iterations = int(row["iterations"]) if row else 0
        while True:
            if time.monotonic() - started_at > self.max_elapsed:
                raise TaskLimitReachedError(f"time budget exceeded ({int(self.max_elapsed)}s)")
            if iterations >= self.max_iterations:
                raise TaskLimitReachedError(f"iteration budget exceeded ({self.max_iterations})")
            steps = self.read_plan_steps(task_id)
            pending = next((s for s in steps if s.get("status") in ("pending", "active")), None)
            if pending is None:
                break
            pending["status"] = "active"
            self.save_plan_steps(task_id, steps)
            await self.bus.publish_event(task_id, "step.started", {"title": pending["title"]})
            action = await self.ask_model_for_next_action(
                task_id, model, pending["title"], observations, workspace
            )
            iterations += 1
            self.conn.execute("UPDATE tasks SET iterations = ? WHERE id = ?", (iterations, task_id))
            self.conn.commit()
            if action.get("done"):
                pending["status"] = "done"
                self.save_plan_steps(task_id, steps)
                await self.bus.publish_event(task_id, "step.done", {"title": pending["title"]})
                observations.append(f"step done: {action.get('summary', '')}"[:400])
                continue
            tool_name = str(action.get("tool", ""))
            args = action.get("args", {})
            why = str(action.get("why", ""))[:300]
            if not tool_name or not isinstance(args, dict):
                observations.append("model response was not actionable; will ask once more")
                continue
            keep_open = bool(pending.get("until_done"))
            try:
                result = await self.execute_tool_waiting_for_approval(task_id, tool_name, args, why)
            except TaskBlockedError:
                pending["status"] = "blocked"
                self.save_plan_steps(task_id, steps)
                raise
            except ToolCallFailedError as exc:
                observations.append(f"{tool_name} failed: {exc}"[:400])
                if keep_open:
                    continue
                pending["status"] = "failed"
                self.save_plan_steps(task_id, steps)
                await self.bus.publish_event(
                    task_id, "step.failed", {"title": pending["title"], "error": str(exc)[:300]}
                )
                continue
            observations.append(f"{tool_name} -> {str(result)[:400]}")
            if keep_open:
                continue
            pending["status"] = "done"
            self.save_plan_steps(task_id, steps)
            await self.bus.publish_event(task_id, "step.done", {"title": pending["title"]})
            done_count = sum(1 for s in steps if s.get("status") == "done")
            pct = 10 + int(80 * done_count / max(len(steps), 1))
            self.set_step_and_progress(task_id, max(self.current_step_index(task_id), 1), pct)
            await self.publish_progress(task_id, pct, pending["title"])

    async def ask_model_for_next_action(
        self, task_id: str, model: str, step_title: str, observations: list[str], workspace: str
    ) -> dict:
        text = await self.call_model_with_retries(
            task_id,
            [
                {
                    "role": "user",
                    "content": self.build_next_action_prompt(
                        self.read_task_objective(task_id),
                        step_title,
                        observations,
                        workspace,
                        self.knowledge_for_task(task_id),
                    ),
                }
            ],
            model,
            "act",
        )
        return self.parse_first_json_object_in_text(text) or {"unparseable": True}
