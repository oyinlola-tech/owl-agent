from __future__ import annotations

import json
import sqlite3

from ..databases.recordStamp_database import current_utc_time
from ..guards.secretScrub_guard import redact_secrets_in_text

PROFILE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    experience TEXT NOT NULL DEFAULT '',
    languages TEXT NOT NULL DEFAULT '[]',
    package_managers TEXT NOT NULL DEFAULT '[]',
    code_style TEXT NOT NULL DEFAULT '',
    test_framework TEXT NOT NULL DEFAULT '',
    commit_style TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT '',
    projects_folder TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS onboarding_progress (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    step TEXT NOT NULL DEFAULT 'welcome',
    completed INTEGER NOT NULL DEFAULT 0,
    skipped_steps TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);
"""

PROFILE_TEXT_FIELDS = (
    "display_name",
    "role",
    "experience",
    "code_style",
    "test_framework",
    "commit_style",
    "tone",
    "projects_folder",
)
PROFILE_LIST_FIELDS = ("languages", "package_managers")


def clean_profile_text(value: str) -> str:
    # Security: the profile is fed into prompts and exports, so anything that looks like a
    # secret is replaced before it is stored.
    cleaned, _ = redact_secrets_in_text(" ".join(str(value).split()))
    return cleaned


def clean_profile_list(values: list[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        cleaned = clean_profile_text(value)
        if cleaned and cleaned.lower() not in (s.lower() for s in seen):
            seen.append(cleaned)
    return seen


class UserProfileStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        conn.executescript(PROFILE_SCHEMA_SQL)

    def read_profile(self) -> dict:
        row = self.conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        profile = {name: "" for name in PROFILE_TEXT_FIELDS}
        profile.update({name: [] for name in PROFILE_LIST_FIELDS})
        profile["updated_at"] = None
        if row is not None:
            data = dict(row)
            for name in PROFILE_TEXT_FIELDS:
                profile[name] = data[name]
            for name in PROFILE_LIST_FIELDS:
                try:
                    loaded = json.loads(data[name] or "[]")
                except ValueError:
                    loaded = []
                profile[name] = [str(v) for v in loaded] if isinstance(loaded, list) else []
            profile["updated_at"] = data["updated_at"]
        profile["is_empty"] = not any(
            profile[name] for name in PROFILE_TEXT_FIELDS + PROFILE_LIST_FIELDS
        )
        return profile

    def save_profile(self, values: dict) -> dict:
        row = {name: clean_profile_text(values.get(name, "")) for name in PROFILE_TEXT_FIELDS}
        for name in PROFILE_LIST_FIELDS:
            row[name] = json.dumps(clean_profile_list(list(values.get(name) or [])))
        row["updated_at"] = current_utc_time().isoformat()
        columns = list(row)
        self.conn.execute(
            f"INSERT INTO user_profile (id, {', '.join(columns)})"
            f" VALUES (1, {', '.join('?' for _ in columns)})"
            " ON CONFLICT(id) DO UPDATE SET " + ", ".join(f"{c}=excluded.{c}" for c in columns),
            tuple(row.values()),
        )
        self.conn.commit()
        return self.read_profile()

    def summarize_profile_for_prompt(self) -> str:
        profile = self.read_profile()
        if profile["is_empty"]:
            return ""
        labels = (
            ("display_name", "Name"),
            ("role", "Role"),
            ("experience", "Experience"),
            ("languages", "Languages and frameworks"),
            ("package_managers", "Package managers"),
            ("code_style", "Code style"),
            ("test_framework", "Test framework"),
            ("commit_style", "Commit style"),
            ("tone", "Preferred tone"),
        )
        parts = []
        for name, label in labels:
            value = profile[name]
            if isinstance(value, list):
                value = ", ".join(value)
            if value:
                parts.append(f"{label}: {str(value)[:200]}")
        return "; ".join(parts)

    def read_onboarding(self) -> dict:
        row = self.conn.execute("SELECT * FROM onboarding_progress WHERE id = 1").fetchone()
        if row is None:
            return {"step": "welcome", "completed": False, "skipped_steps": [], "updated_at": None}
        try:
            skipped = json.loads(row["skipped_steps"] or "[]")
        except ValueError:
            skipped = []
        return {
            "step": row["step"],
            "completed": bool(row["completed"]),
            "skipped_steps": [str(s) for s in skipped] if isinstance(skipped, list) else [],
            "updated_at": row["updated_at"],
        }

    def save_onboarding(self, step: str, completed: bool, skipped_steps: list[str]) -> dict:
        self.conn.execute(
            """INSERT INTO onboarding_progress (id, step, completed, skipped_steps, updated_at)
               VALUES (1, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET step=excluded.step, completed=excluded.completed,
                 skipped_steps=excluded.skipped_steps, updated_at=excluded.updated_at""",
            (
                step,
                1 if completed else 0,
                json.dumps(sorted(set(skipped_steps))),
                current_utc_time().isoformat(),
            ),
        )
        self.conn.commit()
        return self.read_onboarding()
