"""Backend approval policy.

Frontend approval widgets are convenience UI only. Nothing proceeds without a
server-side decision recorded through the approvals endpoints, enforced here.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from typing import Literal

Action = Literal["read", "propose", "execute_command", "modify_file", "privileged", "network"]


class NotApprovedError(Exception):
    """Raised when a gated action lacks a recorded backend approval."""


class ApprovalPolicy:
    """Interface. Phase 3 tools must consult this before acting."""

    def requires_approval(self, action: Action) -> bool:
        raise NotImplementedError

    def enforce(self, action: Action, approved: bool) -> None:
        if self.requires_approval(action) and not approved:
            raise NotApprovedError(f"action '{action}' requires a recorded backend approval")


class DefaultApprovalPolicy(ApprovalPolicy):
    """Reads and proposals flow freely. Anything that touches the machine gates."""

    GATED: frozenset[Action] = frozenset(
        {"execute_command", "modify_file", "privileged", "network"}
    )

    def requires_approval(self, action: Action) -> bool:
        return action in self.GATED


def action_hash(action: str, args: dict) -> str:
    canonical = json.dumps({"action": action, "args": args}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def usable_approval(
    conn: sqlite3.Connection, task_id: str, action: str, args: dict, now: datetime | None = None
) -> tuple[sqlite3.Row | None, str]:
    """Find a bound approval for this exact action. Returns (row, '') or (None, reason)."""
    wanted = action_hash(action, args)
    now = now or datetime.now(UTC)
    rows = conn.execute(
        "SELECT * FROM approvals WHERE task_id = ? AND action = ? AND status = 'approved'"
        " ORDER BY created_at DESC",
        (task_id, action),
    ).fetchall()
    if not rows:
        return None, "no recorded backend approval for this action"
    for row in rows:
        if row["args_hash"] and row["args_hash"] != wanted:
            continue
        if row["expires_at"] and row["expires_at"] < now.isoformat():
            continue
        if row["scope"] != "task" and row["consumed_at"]:
            continue
        return row, ""
    return None, "no fresh, unconsumed approval matches this exact action"


def consume_approval(
    conn: sqlite3.Connection, approval_id: str, now: datetime | None = None
) -> None:
    stamp = (now or datetime.now(UTC)).isoformat()
    conn.execute("UPDATE approvals SET consumed_at = ? WHERE id = ?", (stamp, approval_id))
    conn.commit()
