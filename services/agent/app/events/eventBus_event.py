from __future__ import annotations

import asyncio
from collections import defaultdict, deque

from ..databases.recordStamp_database import current_utc_time
from ..schemas.task_schema import AgentEvent


class EventBus:
    def __init__(self, history: int = 20) -> None:
        self._subs: dict[str, list[asyncio.Queue[AgentEvent]]] = defaultdict(list)
        self._seq: dict[str, int] = defaultdict(int)
        self._history: dict[str, deque[AgentEvent]] = defaultdict(lambda: deque(maxlen=history))
        self._lock = asyncio.Lock()

    async def publish_event(self, task_id: str, type: str, data: dict | None = None) -> AgentEvent:
        async with self._lock:
            self._seq[task_id] += 1
            event = AgentEvent(
                seq=self._seq[task_id],
                type=type,
                task_id=task_id,
                data=data or {},
                created_at=current_utc_time(),
            )
            self._history[task_id].append(event)
            queues = list(self._subs[task_id])
        for q in queues:
            q.put_nowait(event)
        return event

    def list_recent_events(self, task_id: str, limit: int = 20) -> list[AgentEvent]:
        return list(self._history.get(task_id, []))[-limit:]

    async def subscribe_to_task(self, task_id: str) -> asyncio.Queue[AgentEvent]:
        q: asyncio.Queue[AgentEvent] = asyncio.Queue()
        async with self._lock:
            self._subs[task_id].append(q)
        return q

    async def unsubscribe_from_task(self, task_id: str, q: asyncio.Queue[AgentEvent]) -> None:
        async with self._lock:
            subs = self._subs.get(task_id, [])
            if q in subs:
                subs.remove(q)
