from __future__ import annotations

import json
import sqlite3

from ...databases.recordStamp_database import current_utc_time

PROVIDER_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS provider_settings (
    provider_id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    key_source TEXT NOT NULL DEFAULT '',
    key_hint TEXT NOT NULL DEFAULT '',
    models_json TEXT NOT NULL DEFAULT '[]',
    options_json TEXT NOT NULL DEFAULT '{}',
    last_status TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    checked_at TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

EDITABLE_FIELDS = (
    "base_url",
    "model",
    "key_source",
    "key_hint",
    "last_status",
    "last_error",
    "checked_at",
)


class ProviderConfigStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        conn.executescript(PROVIDER_SCHEMA_SQL)

    def read_provider_settings(self, provider_id: str) -> dict:
        row = self.conn.execute(
            "SELECT * FROM provider_settings WHERE provider_id = ?", (provider_id,)
        ).fetchone()
        if row is None:
            return {
                "provider_id": provider_id,
                "base_url": "",
                "model": "",
                "key_source": "",
                "key_hint": "",
                "models": [],
                "options": {},
                "last_status": "",
                "last_error": "",
                "checked_at": None,
            }
        data = dict(row)
        data["models"] = self.load_json_list(data.pop("models_json"))
        try:
            options = json.loads(data.pop("options_json") or "{}")
        except ValueError:
            options = {}
        data["options"] = options if isinstance(options, dict) else {}
        return data

    @staticmethod
    def load_json_list(text: str) -> list[str]:
        try:
            value = json.loads(text or "[]")
        except ValueError:
            return []
        return [str(v) for v in value] if isinstance(value, list) else []

    def save_provider_settings(
        self,
        provider_id: str,
        *,
        models: list[str] | None = None,
        options: dict | None = None,
        **fields: object,
    ) -> dict:
        current = self.read_provider_settings(provider_id)
        for name, value in fields.items():
            if name not in EDITABLE_FIELDS:
                raise ValueError(f"unknown provider field {name}")
            current[name] = value
        if models is not None:
            current["models"] = sorted(set(models))[:1000]
        if options is not None:
            current["options"] = {**current["options"], **options}
        self.conn.execute(
            """INSERT INTO provider_settings (provider_id, base_url, model, key_source, key_hint,
                   models_json, options_json, last_status, last_error, checked_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(provider_id) DO UPDATE SET
                 base_url=excluded.base_url, model=excluded.model,
                 key_source=excluded.key_source, key_hint=excluded.key_hint,
                 models_json=excluded.models_json, options_json=excluded.options_json,
                 last_status=excluded.last_status, last_error=excluded.last_error,
                 checked_at=excluded.checked_at, updated_at=excluded.updated_at""",
            (
                provider_id,
                current["base_url"],
                current["model"],
                current["key_source"],
                current["key_hint"],
                json.dumps(current["models"]),
                json.dumps(current["options"]),
                current["last_status"],
                str(current["last_error"])[:300],
                current["checked_at"],
                current_utc_time().isoformat(),
            ),
        )
        self.conn.commit()
        return self.read_provider_settings(provider_id)

    def read_active_provider_id(self) -> str:
        row = self.conn.execute(
            "SELECT value FROM provider_preferences WHERE key = 'active_provider'"
        ).fetchone()
        return str(row["value"]) if row else ""

    def save_active_provider_id(self, provider_id: str) -> None:
        self.conn.execute(
            """INSERT INTO provider_preferences (key, value, updated_at)
               VALUES ('active_provider', ?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value,
                 updated_at=excluded.updated_at""",
            (provider_id, current_utc_time().isoformat()),
        )
        self.conn.commit()
