from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from typing import Literal

GatedAction = Literal["read", "propose", "execute_command", "modify_file", "privileged", "network"]


class NotApprovedError(Exception):
    pass


class ApprovalPolicy:
    # Security: frontend approval widgets are convenience UI only. Nothing proceeds without
    # a server-side decision recorded through the approvals endpoints, enforced here.

    def requires_approval(self, action: GatedAction) -> bool:
        raise NotImplementedError

    def raise_if_not_approved(self, action: GatedAction, approved: bool) -> None:
        if self.requires_approval(action) and not approved:
            raise NotApprovedError(f"action '{action}' requires a recorded backend approval")


class DefaultApprovalPolicy(ApprovalPolicy):
    # Security: reads and proposals flow freely; anything that touches the machine is gated.
    GATED_ACTIONS: frozenset[GatedAction] = frozenset(
        {"execute_command", "modify_file", "privileged", "network"}
    )

    def requires_approval(self, action: GatedAction) -> bool:
        return action in self.GATED_ACTIONS


def hash_action_with_arguments(action: str, args: dict) -> str:
    canonical = json.dumps({"action": action, "args": args}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def find_usable_approval_for_action(
    conn: sqlite3.Connection, task_id: str, action: str, args: dict, now: datetime | None = None
) -> tuple[sqlite3.Row | None, str]:
    # Security: an approval only counts for this exact action and arguments, while fresh,
    # and (unless task-scoped) only once.
    wanted = hash_action_with_arguments(action, args)
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


def mark_approval_consumed(
    conn: sqlite3.Connection, approval_id: str, now: datetime | None = None
) -> None:
    stamp = (now or datetime.now(UTC)).isoformat()
    conn.execute("UPDATE approvals SET consumed_at = ? WHERE id = ?", (stamp, approval_id))
    conn.commit()
