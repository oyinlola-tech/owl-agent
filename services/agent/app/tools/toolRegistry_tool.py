from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from .handlers.browserPage_handler import open_browser_page
from .handlers.fileChange_handler import (
    apply_workspace_edit,
    create_workspace_file,
    propose_workspace_edit,
)
from .handlers.fileReading_handler import (
    list_workspace_entries,
    read_workspace_file,
    search_workspace_files,
    stat_workspace_path,
)
from .handlers.gitCommand_handler import (
    commit_listed_files,
    push_to_remote,
    show_git_branch,
    show_git_diff,
    show_git_log,
    show_git_status,
)
from .handlers.terminalCommand_handler import run_terminal_command
from .toolArgument_tool import (
    BrowserOpenArguments,
    CommandRunArguments,
    DirectoryListArguments,
    EditApplyArguments,
    EditProposalArguments,
    FileCreateArguments,
    FileReadArguments,
    FileSearchArguments,
    FileStatArguments,
    GitCommitArguments,
    GitPushArguments,
    GitReadArguments,
)


@dataclass
class ToolDefinition:
    name: str
    description: str
    arguments_model: type[BaseModel]
    requires_approval: bool
    handler_name: str = ""


REGISTERED_TOOLS: dict[str, ToolDefinition] = {}


def register_tool(tool: ToolDefinition) -> ToolDefinition:
    tool.handler_name = tool.name
    REGISTERED_TOOLS[tool.name] = tool
    return tool


TOOL_HANDLERS: dict[str, Any] = {
    "fs_list": list_workspace_entries,
    "fs_read": read_workspace_file,
    "fs_search": search_workspace_files,
    "fs_stat": stat_workspace_path,
    "fs_create": create_workspace_file,
    "fs_propose_edit": propose_workspace_edit,
    "fs_apply_edit": apply_workspace_edit,
    "exec_run": run_terminal_command,
    "git_status": show_git_status,
    "git_diff": show_git_diff,
    "git_log": show_git_log,
    "git_branch": show_git_branch,
    "git_commit": commit_listed_files,
    "git_push": push_to_remote,
    "browser_open": open_browser_page,
}

register_tool(
    ToolDefinition("fs_list", "List project directories and files.", DirectoryListArguments, False)
)
register_tool(
    ToolDefinition("fs_read", "Read a text file with offset and limit.", FileReadArguments, False)
)
register_tool(
    ToolDefinition("fs_search", "Search file contents by regex.", FileSearchArguments, False)
)
register_tool(
    ToolDefinition("fs_stat", "File metadata and modification status.", FileStatArguments, False)
)
register_tool(
    ToolDefinition("fs_create", "Create a new file. Requires approval.", FileCreateArguments, True)
)
register_tool(
    ToolDefinition(
        "fs_propose_edit",
        "Propose a file edit and get a diff. No changes made.",
        EditProposalArguments,
        False,
    )
)
register_tool(
    ToolDefinition(
        "fs_apply_edit",
        "Apply a proposed edit. Requires a bound approval.",
        EditApplyArguments,
        True,
    )
)
register_tool(
    ToolDefinition(
        "exec_run", "Run a command by argv array. Requires approval.", CommandRunArguments, True
    )
)
register_tool(ToolDefinition("git_status", "Read-only git status.", GitReadArguments, False))
register_tool(ToolDefinition("git_diff", "Read-only git diff.", GitReadArguments, False))
register_tool(ToolDefinition("git_log", "Read-only recent commits.", GitReadArguments, False))
register_tool(ToolDefinition("git_branch", "Read-only current branch.", GitReadArguments, False))
register_tool(
    ToolDefinition(
        "git_commit", "Stage paths and commit. Requires approval.", GitCommitArguments, True
    )
)
register_tool(
    ToolDefinition("git_push", "Push to a remote. Requires approval.", GitPushArguments, True)
)
register_tool(
    ToolDefinition(
        "browser_open",
        "Open a URL and read title and text. Read-only.",
        BrowserOpenArguments,
        False,
    )
)
