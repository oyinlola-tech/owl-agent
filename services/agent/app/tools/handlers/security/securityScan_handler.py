from __future__ import annotations

import os

from ....guards.workspaceAccess_guard import WorkspaceAccessGuard, WorkspaceError
from ....securityscans.findingStore_securityscan import SecurityScanStore
from ....securityscans.scanRunner_securityscan import run_project_scan
from ...toolArgument_tool import SecurityScanArguments
from ...toolError_tool import ToolError

MAX_TOOL_FINDINGS = 50


def find_owning_project_id(conn, scan_dir: str) -> str:
    best_id = ""
    best_len = -1
    for row in conn.execute("SELECT id, path FROM projects").fetchall():
        path = row["path"]
        if (scan_dir == path or scan_dir.startswith(path + os.sep)) and len(path) > best_len:
            best_id, best_len = row["id"], len(path)
    return best_id


async def run_security_scan(ctx: dict, args: SecurityScanArguments) -> dict:
    auth: WorkspaceAccessGuard = ctx["auth"]
    executor = ctx.get("exec")
    conn = ctx["conn"]
    if executor is None:
        raise ToolError("execution service unavailable")
    try:
        scan_dir = auth.resolve_authorized_path(args.path or ".")
    except WorkspaceError as exc:
        raise ToolError(str(exc)) from exc
    if not os.path.isdir(scan_dir):
        raise ToolError("not a directory")
    project_id = find_owning_project_id(conn, scan_dir)
    store = SecurityScanStore(conn)
    selected = [t for t in args.tools] if args.tools else None
    summary = await run_project_scan(
        conn,
        executor,
        store,
        {"id": project_id, "path": scan_dir},
        selected_tools=selected,
        task_id=ctx["task_id"],
    )
    findings = store.list_findings(project_id, limit=MAX_TOOL_FINDINGS)
    return {
        "scan_id": summary["id"],
        "counts_by_severity": summary["counts_by_severity"],
        "tools_run": summary["tools_run"],
        "tools_skipped": summary["tools_skipped"],
        "findings": findings,
    }
