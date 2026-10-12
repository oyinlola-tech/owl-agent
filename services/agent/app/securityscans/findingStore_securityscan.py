from __future__ import annotations

import json
import sqlite3

from ..databases.recordStamp_database import create_prefixed_id, current_utc_time

SEVERITY_ORDER = ("critical", "high", "medium", "low", "info")
FINDING_STATUSES = ("open", "confirmed", "fixed", "false_positive", "accepted_risk")
MAX_FINDING_ROWS = 2000

SECURITY_SCAN_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS security_scans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    tools_run TEXT NOT NULL DEFAULT '[]',
    tools_skipped TEXT NOT NULL DEFAULT '[]',
    counts_by_severity TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_security_scans_project ON security_scans(project_id, started_at);
CREATE TABLE IF NOT EXISTS security_findings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    scan_id TEXT NOT NULL DEFAULT '',
    tool TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    category TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    file TEXT NOT NULL DEFAULT '',
    line INTEGER,
    message TEXT NOT NULL DEFAULT '',
    cwe TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    fingerprint TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_security_findings_project ON security_findings(project_id, scan_id);
"""


def convert_finding_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "scan_id": row["scan_id"],
        "tool": row["tool"],
        "severity": row["severity"],
        "category": row["category"],
        "title": row["title"],
        "file": row["file"],
        "line": row["line"],
        "message": row["message"],
        "cwe": row["cwe"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def convert_scan_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "status": row["status"],
        "tools_run": json.loads(row["tools_run"] or "[]"),
        "tools_skipped": json.loads(row["tools_skipped"] or "[]"),
        "counts_by_severity": json.loads(row["counts_by_severity"] or "{}"),
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }


class SecurityScanStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        self.conn.executescript(SECURITY_SCAN_SCHEMA_SQL)
        self.conn.commit()

    def start_scan(self, project_id: str) -> str:
        scan_id = create_prefixed_id("scan")
        self.conn.execute(
            "INSERT INTO security_scans (id, project_id, status, started_at) VALUES (?, ?, ?, ?)",
            (scan_id, project_id, "running", current_utc_time().isoformat()),
        )
        self.conn.commit()
        return scan_id

    def record_finding(self, project_id: str, scan_id: str, finding: dict) -> None:
        # Security: a finding's human-set status (false_positive, accepted_risk, fixed) is kept
        # across rescans; only the latest scan id and location details are refreshed.
        now = current_utc_time().isoformat()
        existing = self.conn.execute(
            "SELECT id FROM security_findings WHERE project_id = ? AND fingerprint = ?",
            (project_id, finding["fingerprint"]),
        ).fetchone()
        if existing is not None:
            self.conn.execute(
                "UPDATE security_findings SET scan_id = ?, severity = ?, category = ?, title = ?,"
                " file = ?, line = ?, message = ?, cwe = ?, updated_at = ? WHERE id = ?",
                (
                    scan_id,
                    finding["severity"],
                    finding["category"],
                    finding["title"],
                    finding["file"],
                    finding["line"],
                    finding["message"],
                    finding["cwe"],
                    now,
                    existing["id"],
                ),
            )
            return
        self.conn.execute(
            "INSERT INTO security_findings (id, project_id, scan_id, tool, severity, category,"
            " title, file, line, message, cwe, status, fingerprint, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                create_prefixed_id("find"),
                project_id,
                scan_id,
                finding["tool"],
                finding["severity"],
                finding["category"],
                finding["title"],
                finding["file"],
                finding["line"],
                finding["message"],
                finding["cwe"],
                "open",
                finding["fingerprint"],
                now,
                now,
            ),
        )

    def finish_scan(
        self, scan_id: str, tools_run: list, tools_skipped: list, status: str = "completed"
    ) -> dict:
        counts = self.count_scan_findings_by_severity(scan_id)
        self.conn.execute(
            "UPDATE security_scans SET status = ?, tools_run = ?, tools_skipped = ?,"
            " counts_by_severity = ?, finished_at = ? WHERE id = ?",
            (
                status,
                json.dumps(tools_run),
                json.dumps(tools_skipped),
                json.dumps(counts),
                current_utc_time().isoformat(),
                scan_id,
            ),
        )
        self.conn.commit()
        return self.get_scan(scan_id)

    def count_scan_findings_by_severity(self, scan_id: str) -> dict:
        rows = self.conn.execute(
            "SELECT severity, COUNT(*) AS n FROM security_findings WHERE scan_id = ?"
            " GROUP BY severity",
            (scan_id,),
        ).fetchall()
        tally = {name: 0 for name in SEVERITY_ORDER}
        for row in rows:
            tally[row["severity"]] = tally.get(row["severity"], 0) + row["n"]
        return tally

    def get_scan(self, scan_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM security_scans WHERE id = ?", (scan_id,)).fetchone()
        return convert_scan_row(row) if row is not None else None

    def list_scans(self, project_id: str, limit: int = 50) -> list[dict]:
        limit = min(max(int(limit), 1), 200)
        rows = self.conn.execute(
            "SELECT * FROM security_scans WHERE project_id = ? ORDER BY started_at DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
        return [convert_scan_row(r) for r in rows]

    def list_findings(
        self,
        project_id: str,
        severity: str = "",
        status: str = "",
        tool: str = "",
        limit: int = MAX_FINDING_ROWS,
    ) -> list[dict]:
        clauses = ["project_id = ?"]
        params: list = [project_id]
        for column, value in (("severity", severity), ("status", status), ("tool", tool)):
            if value:
                clauses.append(f"{column} = ?")
                params.append(value)
        limit = min(max(int(limit), 1), MAX_FINDING_ROWS)
        params.append(limit)
        rows = self.conn.execute(
            "SELECT * FROM security_findings WHERE "
            + " AND ".join(clauses)
            + " ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        return [convert_finding_row(r) for r in rows]

    def update_finding_status(self, project_id: str, finding_id: str, status: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM security_findings WHERE id = ? AND project_id = ?",
            (finding_id, project_id),
        ).fetchone()
        if row is None:
            return None
        self.conn.execute(
            "UPDATE security_findings SET status = ?, updated_at = ? WHERE id = ?",
            (status, current_utc_time().isoformat(), finding_id),
        )
        self.conn.commit()
        updated = self.conn.execute(
            "SELECT * FROM security_findings WHERE id = ?", (finding_id,)
        ).fetchone()
        return convert_finding_row(updated)
