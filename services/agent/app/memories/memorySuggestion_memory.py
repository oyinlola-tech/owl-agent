from __future__ import annotations

import json
import shlex
import sqlite3

from .memoryStore_memory import MemoryStore
from .promptKnowledge_memory import SUGGESTION_SOURCE_PREFIX

MAX_SUGGESTIONS_PER_TASK = 5


def format_argv_for_memory(command_json: str) -> str:
    try:
        argv = json.loads(command_json or "[]")
    except ValueError:
        return ""
    if not isinstance(argv, list) or not argv:
        return ""
    return shlex.join(str(a) for a in argv)[:200]


def collect_task_lessons(conn: sqlite3.Connection, task_id: str) -> list[str]:
    lessons: list[str] = []
    for row in conn.execute(
        "SELECT title, command FROM approvals WHERE task_id = ? AND status = 'rejected'"
        " ORDER BY created_at",
        (task_id,),
    ).fetchall():
        what = row["command"] or row["title"]
        lessons.append(f"The user declined this before: {str(what)[:200]}. Ask before doing it.")
    seen_checks: set[str] = set()
    for row in conn.execute(
        "SELECT command_json FROM verification_runs WHERE task_id = ? AND status = 'passed'"
        " ORDER BY started_at",
        (task_id,),
    ).fetchall():
        command = format_argv_for_memory(row["command_json"])
        if command and command not in seen_checks:
            seen_checks.add(command)
            lessons.append(f"This project is verified with `{command}`.")
    return lessons[:MAX_SUGGESTIONS_PER_TASK]


def propose_memories_after_task(
    conn: sqlite3.Connection, memory: MemoryStore, task_id: str
) -> list[dict]:
    row = conn.execute("SELECT project FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return []
    project = str(row["project"] or "")
    saved = []
    for lesson in collect_task_lessons(conn, task_id):
        created = memory.save_memory(
            "project" if project else "task",
            lesson,
            project=project,
            confirmed=False,
            source=f"{SUGGESTION_SOURCE_PREFIX}{task_id}",
        )
        if created:
            saved.append(created)
    return saved


def list_memory_suggestions(conn: sqlite3.Connection, task_id: str = "") -> list[dict]:
    query = "SELECT * FROM memories WHERE confirmed = 0 AND source LIKE ?"
    pattern = f"{SUGGESTION_SOURCE_PREFIX}{task_id}" if task_id else f"{SUGGESTION_SOURCE_PREFIX}%"
    rows = conn.execute(query + " ORDER BY created_at DESC LIMIT 100", (pattern,)).fetchall()
    return [dict(r) for r in rows]
