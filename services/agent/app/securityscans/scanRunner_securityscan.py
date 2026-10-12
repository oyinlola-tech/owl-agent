from __future__ import annotations

import json
import os
import sqlite3

from ..executors.commandExecutor_executor import CommandError, CommandExecutor
from .findingNormalizer_securityscan import normalize_tool_output
from .findingStore_securityscan import SecurityScanStore
from .scannerCatalog_securityscan import ScannerSpec, build_scanner_catalog


def remove_workspace_file(project_path: str, relative_name: str) -> None:
    try:
        os.remove(os.path.join(project_path, relative_name))
    except OSError:
        pass


def write_workspace_file(project_path: str, relative_name: str, content: str) -> None:
    with open(os.path.join(project_path, relative_name), "w", encoding="utf-8") as handle:
        handle.write(content)


def read_scanner_output(project_path: str, plan, result: dict) -> str | None:
    if plan.report_file is None:
        return result.get("stdout", "")
    report_path = os.path.join(project_path, plan.report_file)
    if not os.path.isfile(report_path):
        return None
    try:
        with open(report_path, encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return None


async def run_single_scanner(
    executor: CommandExecutor, task_id: str, project_path: str, scan_id: str, spec: ScannerSpec
) -> tuple[bool, list[dict], str]:
    slug = f"{scan_id}-{spec.name}"
    plan = spec.build_plan(project_path, slug)
    created = [plan.report_file] if plan.report_file else []
    created += [name for name, _ in plan.aux_files]
    for name in created:
        remove_workspace_file(project_path, name)
    try:
        for name, content in plan.aux_files:
            write_workspace_file(project_path, name, content)
        try:
            result = await executor.run_command(task_id, plan.argv, cwd=project_path, network=False)
        except CommandError as exc:
            return False, [], f"error: {exc}"
        raw = read_scanner_output(project_path, plan, result)
        detail = (result.get("stderr", "") or "no output").strip()[:200]
        if raw is None:
            return False, [], f"error: {detail}"
        if not raw.strip():
            if result.get("exit_code") == 0:
                return True, [], ""
            return False, [], f"error: {detail}"
        # Security: scanner output is parsed strictly as JSON data and never evaluated as code.
        try:
            parsed = json.loads(raw)
        except ValueError:
            return False, [], "error: output was not valid JSON"
        return True, normalize_tool_output(spec.name, parsed), ""
    finally:
        for name in created:
            remove_workspace_file(project_path, name)


async def run_project_scan(
    conn: sqlite3.Connection,
    executor: CommandExecutor,
    store: SecurityScanStore,
    project: dict,
    *,
    selected_tools: list[str] | None = None,
    task_id: str | None = None,
) -> dict:
    project_id = project["id"]
    project_path = project["path"]
    scan_id = store.start_scan(project_id)
    task_id = task_id or f"secscan:{scan_id}"
    tools_run: list[str] = []
    tools_skipped: list[dict] = []
    for spec in build_scanner_catalog():
        if selected_tools is not None and spec.name not in selected_tools:
            continue
        if not spec.is_installed():
            tools_skipped.append({"tool": spec.name, "reason": "not installed"})
            continue
        if not spec.applies(project_path):
            tools_skipped.append(
                {"tool": spec.name, "reason": spec.not_applicable_reason or "not applicable"}
            )
            continue
        ran, findings, reason = await run_single_scanner(
            executor, task_id, project_path, scan_id, spec
        )
        if not ran:
            tools_skipped.append({"tool": spec.name, "reason": reason})
            continue
        tools_run.append(spec.name)
        for finding in findings:
            store.record_finding(project_id, scan_id, finding)
    conn.commit()
    return store.finish_scan(scan_id, tools_run, tools_skipped)
