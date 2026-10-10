"""Durable memory. SQLite today, replaceable interface for later engines."""

from __future__ import annotations

import difflib
import re
import sqlite3
from abc import ABC, abstractmethod

from .models import new_id, utcnow

CATEGORIES = ("global", "project", "task", "knowledge")

SECRET_PATTERNS = (
    re.compile(
        r"(?i)\b(api[_-]?key|api[_-]?secret|password|passwd|pwd|secret|token)\b\s*[:=]\s*\S+"
    ),
    re.compile(
        r"\b(nvapi-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[bpas]-[A-Za-z0-9-]{8,})"
    ),
    re.compile(r"(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----"),
)


def scrub_secrets(text: str) -> tuple[str, bool]:
    """Returns (cleaned, had_secret). Secrets are never stored."""
    had = False
    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            had = True
            text = pattern.sub("[redacted-secret]", text)
    return text, had


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


class MemoryStore(ABC):
    @abstractmethod
    def save(
        self,
        category: str,
        text: str,
        *,
        project: str = "",
        confirmed: bool = True,
        source: str = "",
    ) -> dict | None:
        """Save unless duplicate or secret-only. Returns the row or None."""

    @abstractmethod
    def list(
        self, *, category: str = "", project: str = "", include_disabled: bool = False
    ) -> list[dict]: ...

    @abstractmethod
    def search(self, query: str, *, project: str = "", limit: int = 10) -> list[dict]: ...

    @abstractmethod
    def update(self, memory_id: str, text: str) -> dict | None: ...

    @abstractmethod
    def remove(self, memory_id: str) -> bool: ...

    @abstractmethod
    def set_enabled(self, memory_id: str, enabled: bool) -> bool: ...

    @abstractmethod
    def clear_project(self, project: str) -> int: ...

    @abstractmethod
    def history(self, limit: int = 50) -> list[dict]: ...


class SqliteMemoryStore(MemoryStore):
    def __init__(self, conn: sqlite3.Connection, retention_history: int = 200) -> None:
        self.conn = conn
        self.retention_history = retention_history

    def _log(self, memory_id: str, action: str, text: str) -> None:
        self.conn.execute(
            "INSERT INTO memory_history (memory_id, action, text, created_at) VALUES (?, ?, ?, ?)",
            (memory_id, action, text[:2000], utcnow().isoformat()),
        )
        self.conn.execute(
            "DELETE FROM memory_history WHERE id NOT IN "
            f"(SELECT id FROM memory_history ORDER BY id DESC LIMIT {int(self.retention_history)})"
        )

    def _is_duplicate(self, category: str, project: str, norm: str) -> bool:
        rows = self.conn.execute(
            "SELECT text FROM memories WHERE category = ? AND project = ?", (category, project)
        ).fetchall()
        return any(
            difflib.SequenceMatcher(None, norm, normalize(r["text"])).ratio() > 0.85 for r in rows
        )

    def save(self, category, text="", *, project="", confirmed=True, source=""):
        if category not in CATEGORIES:
            raise ValueError(f"unknown category {category}")
        cleaned, _ = scrub_secrets(text)
        if not cleaned.strip():
            return None
        norm = normalize(cleaned)
        if self._is_duplicate(category, project, norm):
            return None
        now = utcnow().isoformat()
        row = {
            "id": new_id("mem"),
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
        self._log(row["id"], "created", cleaned)
        self.conn.commit()
        return row

    def list(self, *, category="", project="", include_disabled=False):
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

    def search(self, query, *, project="", limit=10):
        terms = [t for t in normalize(query).split() if len(t) > 2]
        if not terms:
            return []
        scored = []
        for row in self.list(project=project):
            hay = normalize(row["text"])
            score = sum(hay.count(t) for t in terms)
            if score:
                scored.append((score, row))
        scored.sort(key=lambda s: -s[0])
        return [r for _, r in scored[:limit]]

    def update(self, memory_id, text):
        cleaned, _ = scrub_secrets(text)
        if not cleaned.strip():
            return None
        cur = self.conn.execute(
            "UPDATE memories SET text = ?, updated_at = ? WHERE id = ?",
            (cleaned, utcnow().isoformat(), memory_id),
        )
        if cur.rowcount == 0:
            return None
        self._log(memory_id, "updated", cleaned)
        self.conn.commit()
        row = self.conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        return dict(row) if row else None

    def remove(self, memory_id):
        row = self.conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        if row is None:
            return False
        self._log(memory_id, "deleted", row["text"])
        self.conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        self.conn.commit()
        return True

    def set_enabled(self, memory_id, enabled):
        cur = self.conn.execute(
            "UPDATE memories SET enabled = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, utcnow().isoformat(), memory_id),
        )
        if cur.rowcount == 0:
            return False
        self._log(memory_id, "disabled" if not enabled else "enabled", "")
        self.conn.commit()
        return True

    def clear_project(self, project):
        rows = self.conn.execute(
            "SELECT id, text FROM memories WHERE project = ? AND category != 'global'", (project,)
        ).fetchall()
        for row in rows:
            self._log(row["id"], "cleared", row["text"])
        cur = self.conn.execute(
            "DELETE FROM memories WHERE project = ? AND category != 'global'", (project,)
        )
        self.conn.commit()
        return cur.rowcount or 0

    def history(self, limit=50):
        rows = self.conn.execute(
            "SELECT * FROM memory_history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    def maintain(self, project: str = "") -> dict:
        """Merge duplicates, drop empties. Never touches source files."""
        rows = self.list(project=project, include_disabled=True)
        merged = 0
        seen: dict[str, str] = {}
        for row in rows:
            norm = normalize(row["text"])
            dup_of = next(
                (
                    mid
                    for mid, n in seen.items()
                    if difflib.SequenceMatcher(None, norm, n).ratio() > 0.9
                ),
                None,
            )
            if dup_of:
                self.remove(row["id"])
                merged += 1
            else:
                seen[row["id"]] = norm
        return {"scanned": len(rows), "merged": merged}
