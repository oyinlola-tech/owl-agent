from __future__ import annotations

import difflib
import sqlite3

from ..databases.recordStamp_database import create_prefixed_id, current_utc_time
from ..guards.secretScrub_guard import redact_secrets_in_text
from .memoryStore_memory import MEMORY_CATEGORIES, MemoryStore, normalize_memory_text


class SqliteMemoryStore(MemoryStore):
    def __init__(self, conn: sqlite3.Connection, retention_history: int = 200) -> None:
        self.conn = conn
        self.retention_history = retention_history

    def log_memory_history(self, memory_id: str, action: str, text: str) -> None:
        self.conn.execute(
            "INSERT INTO memory_history (memory_id, action, text, created_at) VALUES (?, ?, ?, ?)",
            (memory_id, action, text[:2000], current_utc_time().isoformat()),
        )
        self.conn.execute(
            "DELETE FROM memory_history WHERE id NOT IN "
            f"(SELECT id FROM memory_history ORDER BY id DESC LIMIT {int(self.retention_history)})"
        )

    def is_near_duplicate(self, category: str, project: str, norm: str) -> bool:
        rows = self.conn.execute(
            "SELECT text FROM memories WHERE category = ? AND project = ?", (category, project)
        ).fetchall()
        return any(
            difflib.SequenceMatcher(None, norm, normalize_memory_text(r["text"])).ratio() > 0.85
            for r in rows
        )

    def save_memory(self, category, text="", *, project="", confirmed=True, source=""):
        if category not in MEMORY_CATEGORIES:
            raise ValueError(f"unknown category {category}")
        cleaned, _ = redact_secrets_in_text(text)
        if not cleaned.strip():
            return None
        norm = normalize_memory_text(cleaned)
        if self.is_near_duplicate(category, project, norm):
            return None
        now = current_utc_time().isoformat()
        row = {
            "id": create_prefixed_id("mem"),
            "category": category,
            "project": project,
            "text": cleaned,
            "confirmed": 1 if confirmed else 0,
            "enabled": 1,
            "source": source,
            "created_at": now,
            "updated_at": now,
        }
        self.conn.execute(
            "INSERT INTO memories (id, category, project, text, confirmed,"
            " enabled, source, created_at, updated_at)"
            " VALUES (:id, :category, :project, :text, :confirmed,"
            " :enabled, :source, :created_at, :updated_at)",
            row,
        )
        self.log_memory_history(row["id"], "created", cleaned)
        self.conn.commit()
        return row

    def list_memories(self, *, category="", project="", include_disabled=False):
        query = "SELECT * FROM memories WHERE 1=1"
        args: list = []
        if category:
            query += " AND category = ?"
            args.append(category)
        if project:
            query += " AND project = ?"
            args.append(project)
        if not include_disabled:
            query += " AND enabled = 1"
        query += " ORDER BY updated_at DESC"
        return [dict(r) for r in self.conn.execute(query, args).fetchall()]

    def search_memories(self, query, *, project="", limit=10):
        terms = [t for t in normalize_memory_text(query).split() if len(t) > 2]
        if not terms:
            return []
        scored = []
        for row in self.list_memories(project=project):
            hay = normalize_memory_text(row["text"])
            score = sum(hay.count(t) for t in terms)
            if score:
                scored.append((score, row))
        scored.sort(key=lambda s: -s[0])
        return [r for _, r in scored[:limit]]

    def update_memory_text(self, memory_id, text):
        cleaned, _ = redact_secrets_in_text(text)
        if not cleaned.strip():
            return None
        cur = self.conn.execute(
            "UPDATE memories SET text = ?, updated_at = ? WHERE id = ?",
            (cleaned, current_utc_time().isoformat(), memory_id),
        )
        if cur.rowcount == 0:
            return None
        self.log_memory_history(memory_id, "updated", cleaned)
        self.conn.commit()
        row = self.conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        return dict(row) if row else None

    def confirm_memory(self, memory_id: str, text: str | None = None) -> dict | None:
        if text is not None and self.update_memory_text(memory_id, text) is None:
            return None
        cur = self.conn.execute(
            "UPDATE memories SET confirmed = 1, updated_at = ? WHERE id = ?",
            (current_utc_time().isoformat(), memory_id),
        )
        if cur.rowcount == 0:
            return None
        self.log_memory_history(memory_id, "confirmed", "")
        self.conn.commit()
        row = self.conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        return dict(row) if row else None

    def delete_memory(self, memory_id):
        row = self.conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        if row is None:
            return False
        self.log_memory_history(memory_id, "deleted", row["text"])
        self.conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        self.conn.commit()
        return True

    def set_memory_enabled(self, memory_id, enabled):
        cur = self.conn.execute(
            "UPDATE memories SET enabled = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, current_utc_time().isoformat(), memory_id),
        )
        if cur.rowcount == 0:
            return False
        self.log_memory_history(memory_id, "disabled" if not enabled else "enabled", "")
        self.conn.commit()
        return True

    def clear_project_memories(self, project):
        rows = self.conn.execute(
            "SELECT id, text FROM memories WHERE project = ? AND category != 'global'", (project,)
        ).fetchall()
        for row in rows:
            self.log_memory_history(row["id"], "cleared", row["text"])
        cur = self.conn.execute(
            "DELETE FROM memories WHERE project = ? AND category != 'global'", (project,)
        )
        self.conn.commit()
        return cur.rowcount or 0

    def list_memory_history(self, limit=50):
        rows = self.conn.execute(
            "SELECT * FROM memory_history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    def merge_duplicate_memories(self, project: str = "") -> dict:
        rows = self.list_memories(project=project, include_disabled=True)
        merged = 0
        seen: dict[str, str] = {}
        for row in rows:
            norm = normalize_memory_text(row["text"])
            dup_of = next(
                (
                    mid
                    for mid, n in seen.items()
                    if difflib.SequenceMatcher(None, norm, n).ratio() > 0.9
                ),
                None,
            )
            if dup_of:
                self.delete_memory(row["id"])
                merged += 1
            else:
                seen[row["id"]] = norm
        return {"scanned": len(rows), "merged": merged}
