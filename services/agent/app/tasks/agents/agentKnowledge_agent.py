from __future__ import annotations

import logging
import sqlite3

from ...contexts.contextBudget_context import ContextPart
from ...memories.memorySuggestion_memory import propose_memories_after_task

log = logging.getLogger("owl")


class AgentKnowledgeMixin:
    def forget_cached_knowledge(self, task_id: str) -> None:
        self.task_knowledge.pop(task_id, None)

    def knowledge_for_task(self, task_id: str) -> str:
        if task_id in self.task_knowledge:
            return self.task_knowledge[task_id]
        builder = getattr(self, "knowledge", None)
        row = self.fetch_task_row(task_id)
        block = ""
        if builder is not None and row is not None:
            try:
                block = builder.build_block_for_task(task_id, row["prompt"], row["project"] or "")
            except sqlite3.Error as exc:
                log.warning("could not read memories for prompt: %s", type(exc).__name__)
        self.task_knowledge[task_id] = block
        return block

    def build_knowledge_context_part(self, task_id: str) -> list[ContextPart]:
        block = self.knowledge_for_task(task_id)
        return [ContextPart(category="memories", text=block)] if block else []

    def drop_knowledge_when_over_budget(self, task_id: str, kept: list[ContextPart]) -> None:
        if not any(p.category == "memories" for p in kept):
            self.task_knowledge[task_id] = ""

    async def suggest_memories_after_task(self, task_id: str) -> None:
        try:
            saved = propose_memories_after_task(self.conn, self.memory, task_id)
        except (sqlite3.Error, ValueError) as exc:
            log.warning("memory suggestions failed: %s", type(exc).__name__)
            return
        if saved:
            await self.bus.publish_event(
                task_id, "memory.suggested", {"ids": [m["id"] for m in saved]}
            )

    def list_task_memory_uses(self, task_id: str) -> list[dict]:
        builder = getattr(self, "knowledge", None)
        return builder.list_memory_uses(task_id) if builder is not None else []
