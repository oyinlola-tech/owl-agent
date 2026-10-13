from __future__ import annotations

import json
import os
import re
import shlex
import sqlite3

from pydantic import BaseModel, Field

from ..databases.recordStamp_database import create_prefixed_id, current_utc_time
from ..guards.commandRisk_guard import SHELL_PROGRAMS, assess_command_risk, program_name_of
from .toolError_tool import ToolError

CUSTOM_TOOL_NAME_PATTERN = re.compile(r"^[a-z0-9-]{1,40}$")
CUSTOM_TOOL_PREFIX = "custom-"
CUSTOM_TOOL_SOURCE_PREFIX = "custom-tool:"
CUSTOM_TOOL_RISKS = ("low", "medium", "high")
CUSTOM_TOOL_MAX_ARGV = 20
CUSTOM_TOOL_MAX_TOKEN = 500
CUSTOM_TOOL_SHELL_SEPARATOR_PATTERN = re.compile(r"&&|\|\||;|\||`|\\$\(|\\n|>|<")


class CustomToolRunArguments(BaseModel):
    args: str = Field(default="", max_length=2000)
    cwd: str = "."


def custom_tool_source(tool_id: str) -> str:
    return f"{CUSTOM_TOOL_SOURCE_PREFIX}{tool_id}"


def check_custom_tool_fields(
    name: str, description: str, argv: list[str], risk: str, project: str
) -> None:
    if not CUSTOM_TOOL_NAME_PATTERN.match(name or ""):
        raise ValueError("name must match ^[a-z0-9-]{1,40}$")
    if not (description or "").strip() or len(description) > 500:
        raise ValueError("description must be 1-500 characters")
    if not isinstance(argv, list) or not 1 <= len(argv) <= CUSTOM_TOOL_MAX_ARGV:
        raise ValueError(f"argv must be a list of 1-{CUSTOM_TOOL_MAX_ARGV} strings")
    for token in argv:
        if not isinstance(token, str) or not token or len(token) > CUSTOM_TOOL_MAX_TOKEN:
            raise ValueError(f"argv entries must be 1-{CUSTOM_TOOL_MAX_TOKEN} characters")
    executable = argv[0]
    if os.path.isabs(executable) or executable.startswith("~"):
        raise ValueError("executable must be workspace-relative, never an absolute path")
    if any(part in ("", ".", "..") for part in executable.split("/")):
        raise ValueError("executable must be workspace-relative, never an absolute path")
    if program_name_of(executable) in SHELL_PROGRAMS:
        raise ValueError("custom tools never run through a shell")
    for token in argv:
        if CUSTOM_TOOL_SHELL_SEPARATOR_PATTERN.search(token.replace("{args}", "")):
            raise ValueError("custom tools never run through a shell")
    if (risk or "") not in CUSTOM_TOOL_RISKS:
        raise ValueError("risk must be low, medium or high")
    if len(project or "") > 256:
        raise ValueError("project must be at most 256 characters")


def expand_custom_tool_argv(template: list[str], args_text: str) -> list[str]:
    try:
        parts = shlex.split(args_text, posix=True) if (args_text or "").strip() else []
    except ValueError as exc:
        raise ToolError(f"couldn't read the arguments: {exc}") from exc
    expanded: list[str] = []
    used = False
    for token in template:
        if "{args}" in token:
            used = True
            if token == "{args}":
                expanded.extend(parts)
            else:
                expanded.append(token.replace("{args}", args_text or ""))
        else:
            expanded.append(token)
    if not used:
        expanded.extend(parts)
    return expanded


def custom_tool_from_row(row: dict) -> dict | None:
    source = str(row.get("source", ""))
    if not source.startswith(CUSTOM_TOOL_SOURCE_PREFIX):
        return None
    try:
        payload = json.loads(row.get("text", ""))
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        check_custom_tool_fields(
            str(payload.get("name", "")),
            str(payload.get("description", "")),
            list(payload.get("argv", [])),
            str(payload.get("risk", "high")),
            str(payload.get("project", "")),
        )
    except ValueError:
        return None
    return {
        "id": source[len(CUSTOM_TOOL_SOURCE_PREFIX) :],
        "name": str(payload["name"]),
        "description": str(payload["description"]),
        "argv": list(payload["argv"]),
        "risk": str(payload.get("risk", "high")),
        "project": str(payload.get("project", "")),
        "enabled": bool(row.get("enabled", 0)),
    }


def list_custom_tools(conn: sqlite3.Connection, *, project: str = "") -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM memories WHERE source LIKE ? ORDER BY updated_at DESC",
        (f"{CUSTOM_TOOL_SOURCE_PREFIX}%",),
    ).fetchall()
    tools = [t for r in rows if (t := custom_tool_from_row(dict(r))) is not None]
    if project:
        tools = [t for t in tools if not t["project"] or t["project"] == project]
    return tools


def get_custom_tool(conn: sqlite3.Connection, tool_id: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM memories WHERE source = ?", (custom_tool_source(tool_id),)
    ).fetchone()
    return custom_tool_from_row(dict(row)) if row else None


def log_custom_tool_history(conn: sqlite3.Connection, memory_id: str, action: str) -> None:
    conn.execute(
        "INSERT INTO memory_history (memory_id, action, text, created_at) VALUES (?, ?, ?, ?)",
        (memory_id, action, "", current_utc_time().isoformat()),
    )


def create_custom_tool(
    conn: sqlite3.Connection,
    *,
    name: str,
    description: str,
    argv: list[str],
    risk: str = "high",
    project: str = "",
) -> dict:
    check_custom_tool_fields(name, description, argv, risk, project)
    project = project or ""
    for existing in list_custom_tools(conn):
        if existing["name"] == name and existing["project"] == project:
            raise ValueError(f"a custom tool named '{name}' already exists in this scope")
    now = current_utc_time().isoformat()
    tool_id = create_prefixed_id("ctool")
    memory_id = create_prefixed_id("mem")
    text = json.dumps(
        {
            "name": name,
            "description": description,
            "argv": list(argv),
            "risk": risk,
            "project": project,
        }
    )
    conn.execute(
        "INSERT INTO memories (id, category, project, text, confirmed,"
        " enabled, source, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)",
        (
            memory_id,
            "project" if project else "global",
            project,
            text,
            custom_tool_source(tool_id),
            now,
            now,
        ),
    )
    # Security: a new custom tool stays disabled until it is explicitly enabled.
    log_custom_tool_history(conn, memory_id, "created")
    conn.commit()
    created = get_custom_tool(conn, tool_id)
    assert created is not None
    return created


def update_custom_tool(
    conn: sqlite3.Connection,
    tool_id: str,
    *,
    description: str | None = None,
    argv: list[str] | None = None,
    risk: str | None = None,
    project: str | None = None,
) -> dict | None:
    current = get_custom_tool(conn, tool_id)
    if current is None:
        return None
    updated = {
        "description": current["description"] if description is None else description,
        "argv": current["argv"] if argv is None else argv,
        "risk": current["risk"] if risk is None else risk,
        "project": current["project"] if project is None else (project or ""),
    }
    check_custom_tool_fields(
        current["name"],
        str(updated["description"]),
        list(updated["argv"]),
        str(updated["risk"]),
        str(updated["project"]),
    )
    for existing in list_custom_tools(conn):
        if (
            existing["id"] != tool_id
            and existing["name"] == current["name"]
            and existing["project"] == updated["project"]
        ):
            raise ValueError(
                f"a custom tool named '{current['name']}' already exists in this scope"
            )
    text = json.dumps(
        {
            "name": current["name"],
            "description": updated["description"],
            "argv": list(updated["argv"]),
            "risk": updated["risk"],
            "project": updated["project"],
        }
    )
    row = conn.execute(
        "SELECT id FROM memories WHERE source = ?", (custom_tool_source(tool_id),)
    ).fetchone()
    conn.execute(
        "UPDATE memories SET text = ?, project = ?, category = ?, updated_at = ? WHERE source = ?",
        (
            text,
            updated["project"],
            "project" if updated["project"] else "global",
            current_utc_time().isoformat(),
            custom_tool_source(tool_id),
        ),
    )
    if row:
        log_custom_tool_history(conn, str(row["id"]), "updated")
    conn.commit()
    return get_custom_tool(conn, tool_id)


def delete_custom_tool(conn: sqlite3.Connection, tool_id: str) -> bool:
    row = conn.execute(
        "SELECT id FROM memories WHERE source = ?", (custom_tool_source(tool_id),)
    ).fetchone()
    if row is None:
        return False
    log_custom_tool_history(conn, str(row["id"]), "deleted")
    conn.execute("DELETE FROM memories WHERE source = ?", (custom_tool_source(tool_id),))
    conn.commit()
    return True


def set_custom_tool_enabled(conn: sqlite3.Connection, tool_id: str, enabled: bool) -> bool:
    row = conn.execute(
        "SELECT id FROM memories WHERE source = ?", (custom_tool_source(tool_id),)
    ).fetchone()
    if row is None:
        return False
    conn.execute(
        "UPDATE memories SET enabled = ?, updated_at = ? WHERE source = ?",
        (1 if enabled else 0, current_utc_time().isoformat(), custom_tool_source(tool_id)),
    )
    log_custom_tool_history(conn, str(row["id"]), "enabled" if enabled else "disabled")
    conn.commit()
    return True


def make_custom_tool_handler(template: list[str]):
    argv_template = list(template)

    async def run_custom_tool(ctx: dict, args: CustomToolRunArguments) -> dict:
        service = ctx.get("exec")
        if service is None:
            raise ToolError("execution service unavailable")
        expanded = expand_custom_tool_argv(argv_template, args.args)
        verdict, reason = assess_command_risk(expanded)
        if verdict == "refused":
            raise ToolError(f"refused: {reason}")
        # Security: network is granted only by an approval recorded as "with network access".
        network = bool((ctx.get("approval") or {}).get("network"))
        return await service.run_command(
            ctx["task_id"], expanded, args.cwd or ".", None, network=network
        )

    return run_custom_tool


def sync_custom_tools_into_registry(conn: sqlite3.Connection) -> list[dict]:
    from .toolRegistry_tool import REGISTERED_TOOLS, TOOL_HANDLERS, ToolDefinition

    tools = [t for t in list_custom_tools(conn) if t["enabled"]]
    wanted = {f"{CUSTOM_TOOL_PREFIX}{t['name']}" for t in tools}
    for name in [
        n for n in REGISTERED_TOOLS if n.startswith(CUSTOM_TOOL_PREFIX) and n not in wanted
    ]:
        del REGISTERED_TOOLS[name]
        TOOL_HANDLERS.pop(name, None)
    for tool in tools:
        tool_name = f"{CUSTOM_TOOL_PREFIX}{tool['name']}"
        TOOL_HANDLERS[tool_name] = make_custom_tool_handler(list(tool["argv"]))
        REGISTERED_TOOLS[tool_name] = ToolDefinition(
            tool_name, tool["description"], CustomToolRunArguments, True
        )
        REGISTERED_TOOLS[tool_name].metadata["custom_tool"] = {
            "id": tool["id"],
            "argv": list(tool["argv"]),
            "risk": tool["risk"],
            "project": tool["project"],
        }
    return tools
