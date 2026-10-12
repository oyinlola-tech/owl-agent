from __future__ import annotations

import sqlite3


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None


class ProjectResolver:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.name_by_id: dict[str, str] = {}
        if table_exists(conn, "projects"):
            for row in conn.execute("SELECT id, name FROM projects").fetchall():
                self.name_by_id[row["id"]] = row["name"] or row["id"]

    def label(self, token: str, is_id: bool) -> str:
        if is_id:
            return self.name_by_id.get(token, token)
        return token

    def canonical_filter(self, value: str) -> str:
        return self.name_by_id.get(value, value)

    def matches(self, token: str, is_id: bool, filter_value: str) -> bool:
        if not filter_value:
            return True
        label = self.label(token, is_id)
        canonical = self.canonical_filter(filter_value)
        return label == canonical or token == filter_value or label == filter_value
