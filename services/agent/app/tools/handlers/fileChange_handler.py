from __future__ import annotations

import os

from ...executors.fileChange_executor import (
    apply_proposed_edit,
    journal_file_creation,
    propose_file_edit,
)
from ...guards.workspaceAccess_guard import WorkspaceAccessGuard
from ..toolArgument_tool import EditApplyArguments, EditProposalArguments, FileCreateArguments
from ..toolError_tool import ToolError


async def create_workspace_file(ctx: dict, args: FileCreateArguments) -> dict:
    auth: WorkspaceAccessGuard = ctx["auth"]
    canonical = auth.resolve_authorized_path(args.path)
    if os.path.lexists(canonical):
        raise ToolError("file exists; propose an edit instead")
    parent = os.path.dirname(canonical)
    if not os.path.isdir(parent):
        raise ToolError("parent directory does not exist")
    with open(canonical, "w", encoding="utf-8") as fh:
        fh.write(args.content)
    journal_file_creation(ctx["conn"], ctx["task_id"], args.path, args.content)
    return {"path": args.path, "bytes": len(args.content.encode())}


async def propose_workspace_edit(ctx: dict, args: EditProposalArguments) -> dict:
    return propose_file_edit(
        ctx["conn"], ctx["task_id"], ctx["auth"], args.path, args.old, args.new
    )


async def apply_workspace_edit(ctx: dict, args: EditApplyArguments) -> dict:
    approval = ctx.get("approval") or {}
    return apply_proposed_edit(
        ctx["conn"], ctx["task_id"], ctx["auth"], args.proposal_id, str(approval.get("id", ""))
    )
