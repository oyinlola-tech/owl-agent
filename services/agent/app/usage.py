"""Usage telemetry. Actual provider numbers kept apart from estimates."""

from __future__ import annotations

import sqlite3
import time

from .models import utcnow


class UsageRecorder:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def record(
        self,
        *,
        task_id: str = "",
        model: str,
        requested_model: str = "",
        routing_reason: str = "",
        input_tokens: int,
        output_tokens: int,
        estimated: bool,
        duration_ms: int,
        error: str = "",
    ) -> None:
        self.conn.execute(
            """INSERT INTO usage_records (task_id, model, requested_model, routing_reason,
               input_tokens, output_tokens, estimated, duration_ms, retries, error, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (
                task_id,
                model,
                requested_model,
                routing_reason[:500],
                input_tokens,
                output_tokens,
                1 if estimated else 0,
                duration_ms,
                error[:500],
                utcnow().isoformat(),
            ),
        )
        self.conn.commit()

    def for_task(self, task_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM usage_records WHERE task_id = ? ORDER BY id", (task_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def timer_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)
