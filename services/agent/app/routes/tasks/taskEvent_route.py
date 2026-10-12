from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ...events.eventBus_event import EventBus
from ...tasks.taskManager_task import TaskManager


def create_task_event_router(manager: TaskManager, bus: EventBus) -> APIRouter:
    router = APIRouter()

    @router.get("/tasks/{task_id}/events")
    async def stream_events(task_id: str, request: Request):  # type: ignore[no-untyped-def]
        current = manager.get_task_or_404(task_id)

        async def stream_task_events():  # type: ignore[no-untyped-def]
            queue = await bus.subscribe_to_task(task_id)
            try:
                snapshot = {
                    "status": current.status.value,
                    "progress": current.progress,
                    "approvals": [
                        a.model_dump(mode="json") for a in manager.list_task_approvals(task_id)
                    ],
                    "recent": [e.type for e in bus.list_recent_events(task_id)],
                }
                yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    except TimeoutError:
                        yield ": heartbeat\n\n"
                        continue
                    yield f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"
            finally:
                await bus.unsubscribe_from_task(task_id, queue)

        return StreamingResponse(stream_task_events(), media_type="text/event-stream")

    return router
