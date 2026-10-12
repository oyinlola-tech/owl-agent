from __future__ import annotations

import sqlite3

from .knowledgeRecord_knowledge import (
    DEFAULT_SOURCE_LIMIT,
    KNOWLEDGE_TYPES,
    KnowledgeCandidate,
    clip_field,
)
from .projectResolver_knowledge import table_exists


def load_tasks(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT id, prompt, project, status, failure, verification_note, created_at"
        " FROM tasks ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        KnowledgeCandidate(
            type="task",
            id=row["id"],
            project_token=row["project"] or "",
            project_is_id=False,
            created_at=row["created_at"],
            title=clip_field(row["prompt"], 200),
            fields=[
                ("prompt", clip_field(row["prompt"])),
                ("status", row["status"] or ""),
                ("failure", clip_field(row["failure"])),
                ("verification_note", clip_field(row["verification_note"])),
            ],
            source_ref={"task_id": row["id"]},
        )
        for row in rows
    ]


def load_memories(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT id, category, project, text, created_at FROM memories"
        " WHERE enabled = 1 ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        KnowledgeCandidate(
            type="memory",
            id=row["id"],
            project_token=row["project"] or "",
            project_is_id=False,
            created_at=row["created_at"],
            title=clip_field(row["text"], 200),
            fields=[("text", clip_field(row["text"])), ("category", row["category"] or "")],
            source_ref={"memory_id": row["id"]},
        )
        for row in rows
    ]


def load_findings(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT id, project_id, scan_id, tool, severity, category, title, file, message, cwe,"
        " status, created_at FROM security_findings ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out: list[KnowledgeCandidate] = []
    for row in rows:
        headline = row["title"] or row["message"] or ""
        out.append(
            KnowledgeCandidate(
                type="finding",
                id=row["id"],
                project_token=row["project_id"] or "",
                project_is_id=True,
                created_at=row["created_at"],
                title=clip_field(f"{row['severity']} {row['tool']}: {headline}", 200),
                fields=[
                    ("title", row["title"] or ""),
                    ("message", clip_field(row["message"])),
                    ("file", row["file"] or ""),
                    ("tool", row["tool"] or ""),
                    ("category", row["category"] or ""),
                    ("cwe", row["cwe"] or ""),
                    ("status", row["status"] or ""),
                ],
                source_ref={
                    "finding_id": row["id"],
                    "scan_id": row["scan_id"],
                    "project_id": row["project_id"],
                },
            )
        )
    return out


def load_verifications(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT v.id AS id, v.task_id AS task_id, v.requirement_id AS requirement_id,"
        " v.kind AS kind, v.command_json AS command_json, v.status AS status,"
        " v.stdout AS stdout, v.stderr AS stderr, v.created_at AS created_at,"
        " t.project AS task_project FROM verification_runs v"
        " LEFT JOIN tasks t ON t.id = v.task_id ORDER BY v.created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        KnowledgeCandidate(
            type="verification",
            id=row["id"],
            project_token=row["task_project"] or "",
            project_is_id=False,
            created_at=row["created_at"],
            title=clip_field(f"{row['kind']} {row['requirement_id']} [{row['status']}]", 200),
            fields=[
                ("requirement_id", row["requirement_id"] or ""),
                ("kind", row["kind"] or ""),
                ("command", clip_field(row["command_json"])),
                ("stdout", clip_field(row["stdout"])),
                ("stderr", clip_field(row["stderr"])),
                ("status", row["status"] or ""),
            ],
            source_ref={"verification_run_id": row["id"], "task_id": row["task_id"]},
        )
        for row in rows
    ]


def load_changes(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT c.id AS id, c.task_id AS task_id, c.path AS path, c.before_text AS before_text,"
        " c.after_text AS after_text, c.source AS source, c.project_id AS project_id,"
        " c.applied_at AS applied_at, t.project AS task_project FROM change_journal c"
        " LEFT JOIN tasks t ON t.id = c.task_id ORDER BY c.applied_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out: list[KnowledgeCandidate] = []
    for row in rows:
        project_id = row["project_id"] or ""
        out.append(
            KnowledgeCandidate(
                type="change",
                id=row["id"],
                project_token=project_id or (row["task_project"] or ""),
                project_is_id=bool(project_id),
                created_at=row["applied_at"],
                title=clip_field(row["path"], 200),
                fields=[
                    ("path", row["path"] or ""),
                    ("after_text", clip_field(row["after_text"])),
                    ("before_text", clip_field(row["before_text"])),
                    ("source", row["source"] or ""),
                ],
                source_ref={"change_id": row["id"], "task_id": row["task_id"]},
            )
        )
    return out


def load_commands(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT id, project_id, command, status, stdout, stderr, started_at"
        " FROM command_runs ORDER BY started_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        KnowledgeCandidate(
            type="command",
            id=row["id"],
            project_token=row["project_id"] or "",
            project_is_id=True,
            created_at=row["started_at"],
            title=clip_field(row["command"], 200),
            fields=[
                ("command", clip_field(row["command"])),
                ("stdout", clip_field(row["stdout"])),
                ("stderr", clip_field(row["stderr"])),
                ("status", row["status"] or ""),
            ],
            source_ref={"command_run_id": row["id"], "project_id": row["project_id"]},
        )
        for row in rows
    ]


def load_projects(conn: sqlite3.Connection, limit: int) -> list[KnowledgeCandidate]:
    rows = conn.execute(
        "SELECT id, name, path, stack, created_at FROM projects ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        KnowledgeCandidate(
            type="project",
            id=row["id"],
            project_token=row["name"] or "",
            project_is_id=False,
            created_at=row["created_at"],
            title=clip_field(f"{row['name']} ({row['path']})", 200),
            fields=[
                ("name", row["name"] or ""),
                ("path", row["path"] or ""),
                ("stack", clip_field(row["stack"])),
            ],
            source_ref={"project_id": row["id"]},
        )
        for row in rows
    ]


SOURCE_TABLES: dict[str, str] = {
    "task": "tasks",
    "memory": "memories",
    "finding": "security_findings",
    "verification": "verification_runs",
    "change": "change_journal",
    "command": "command_runs",
    "project": "projects",
}

SOURCE_LOADERS = {
    "task": load_tasks,
    "memory": load_memories,
    "finding": load_findings,
    "verification": load_verifications,
    "change": load_changes,
    "command": load_commands,
    "project": load_projects,
}

COUNT_SQL: dict[str, str] = {
    "task": "SELECT COUNT(*) FROM tasks",
    "memory": "SELECT COUNT(*) FROM memories WHERE enabled = 1",
    "finding": "SELECT COUNT(*) FROM security_findings",
    "verification": "SELECT COUNT(*) FROM verification_runs",
    "change": "SELECT COUNT(*) FROM change_journal",
    "command": "SELECT COUNT(*) FROM command_runs",
    "project": "SELECT COUNT(*) FROM projects",
}


def normalize_types(types: list[str] | None) -> list[str]:
    if not types:
        return list(KNOWLEDGE_TYPES)
    return [t for t in KNOWLEDGE_TYPES if t in set(types)]


def load_candidates(
    conn: sqlite3.Connection,
    types: list[str] | None = None,
    per_source_limit: int = DEFAULT_SOURCE_LIMIT,
) -> list[KnowledgeCandidate]:
    out: list[KnowledgeCandidate] = []
    for type_name in normalize_types(types):
        if not table_exists(conn, SOURCE_TABLES[type_name]):
            continue
        out.extend(SOURCE_LOADERS[type_name](conn, per_source_limit))
    return out


def count_by_type(conn: sqlite3.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    for type_name, sql in COUNT_SQL.items():
        if table_exists(conn, SOURCE_TABLES[type_name]):
            counts[type_name] = int(conn.execute(sql).fetchone()[0])
        else:
            counts[type_name] = 0
    return counts
