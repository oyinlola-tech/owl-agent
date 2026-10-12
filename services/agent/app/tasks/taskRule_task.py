from __future__ import annotations

from ..schemas.task_schema import TaskStatus

TERMINAL = frozenset(
    {
        TaskStatus.COMPLETED.value,
        TaskStatus.COMPLETED_UNVERIFIED.value,
        TaskStatus.VERIFIED_COMPLETED.value,
        TaskStatus.FAILED.value,
        TaskStatus.CANCELLED.value,
    }
)

# Security: tools that can change the workspace. Any successful call after a verification run
# makes that run stale: it no longer proves anything about the current files.
MUTATING_TOOLS = frozenset({"fs_create", "fs_apply_edit", "exec_run", "git_commit", "git_push"})

SYSTEM_INSTRUCTIONS = (
    "You are OWL, a careful coding assistant. Propose plans before acting. "
    "Never execute commands or modify files without a recorded approval."
)


class TaskLimitReachedError(Exception):
    pass


class TaskBlockedError(Exception):
    pass


class ToolApprovalNeededError(Exception):
    def __init__(self, tool: str, action_args: dict, why: str) -> None:
        super().__init__(tool)
        self.tool = tool
        self.action_args = action_args
        self.why = why


class ToolCallFailedError(Exception):
    pass
