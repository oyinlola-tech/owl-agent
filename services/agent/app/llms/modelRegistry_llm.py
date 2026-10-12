from __future__ import annotations

import json
import sqlite3

from ..databases.recordStamp_database import current_utc_time

MODEL_STATUSES = ("available", "verified", "untested", "unavailable", "deprecated")

CATEGORY_CAPABILITIES = {
    "chat": ["chat"],
    "plan": ["chat", "reasoning"],
    "code": ["chat", "code"],
    "debug": ["chat", "code", "reasoning"],
    "big_context": ["chat", "long-context"],
    "summarize": ["chat"],
    "multimodal": ["chat", "vision"],
}


class ModelRegistry:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def save_model(
        self,
        model_id: str,
        *,
        status: str = "untested",
        context_window: int | None = None,
        context_source: str = "",
        capabilities: list[str] | None = None,
    ) -> None:
        if status not in MODEL_STATUSES:
            raise ValueError(f"unknown status {status}")
        self.conn.execute(
            """INSERT INTO models (id, context_window, context_source, capabilities,
                                  status, last_seen, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 context_window=COALESCE(excluded.context_window, models.context_window),
                 context_source=CASE WHEN excluded.context_source != ''
                                     THEN excluded.context_source ELSE models.context_source END,
                 capabilities=excluded.capabilities,
                 status=excluded.status,
                 last_seen=excluded.last_seen,
                 updated_at=excluded.updated_at""",
            (
                model_id,
                context_window,
                context_source,
                json.dumps(capabilities or ["chat"]),
                status,
                current_utc_time().isoformat(),
                current_utc_time().isoformat(),
            ),
        )
        self.conn.commit()

    def get_model(self, model_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM models WHERE id = ?", (model_id,)).fetchone()
        return self.convert_model_row(row)

    def list_models(self, *, only_usable: bool = False) -> list[dict]:
        query = "SELECT * FROM models ORDER BY id"
        if only_usable:
            query = "SELECT * FROM models WHERE status IN ('available','verified') ORDER BY id"
        return [self.convert_model_row(r) for r in self.conn.execute(query).fetchall()]

    def sync_with_live_catalog(self, ids: list[str]) -> dict[str, int]:
        known = {r["id"] for r in self.list_models()}
        seen = set(ids)
        added = 0
        for model_id in seen - known:
            self.save_model(model_id, status="available")
            added += 1
        gone = 0
        for model_id in known - seen:
            row = self.get_model(model_id)
            if row and row["status"] != "deprecated":
                self.save_model(
                    model_id,
                    status="deprecated",
                    context_window=row["context_window"],
                    context_source=row["context_source"],
                    capabilities=row["capabilities"],
                )
                gone += 1
        return {"added": added, "deprecated": gone, "total": len(seen)}

    @staticmethod
    def convert_model_row(row: sqlite3.Row | None) -> dict | None:
        if row is None:
            return None
        data = dict(row)
        data["capabilities"] = json.loads(data["capabilities"] or "[]")
        return data
