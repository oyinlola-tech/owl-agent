from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from .handlers.browser.browserInspection_handler import (
    extract_browser_page,
    screenshot_browser_page,
)
from .handlers.browser.browserInteraction_handler import (
    click_browser_target,
    hover_browser_target,
    scroll_browser_page,
    select_browser_target,
    type_browser_target,
    wait_browser_page,
)
from .handlers.browser.browserNavigation_handler import (
    browser_session_back,
    browser_session_forward,
    browser_session_reload,
    close_browser_session,
    navigate_browser_session,
    open_browser_session,
)
from .handlers.browser.browserSideEffect_handler import (
    download_browser_file,
    submit_browser_form,
    upload_browser_file,
)
from .handlers.browserPage_handler import open_browser_page
from .handlers.documents.documentRead_handler import document_read
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
from .handlers.git.gitBranchCommand_handler import (
    checkout_ref,
    create_branch,
    delete_branch,
    merge_ref,
    pull_remote,
)
from .handlers.git.gitMessage_handler import generate_commit_message
from .handlers.gitCommand_handler import (
    commit_listed_files,
    push_to_remote,
    show_git_branch,
    show_git_diff,
    show_git_log,
    show_git_status,
)
from .handlers.knowledge.knowledgeSearch_handler import run_knowledge_search
from .handlers.security.securityScan_handler import run_security_scan
from .handlers.terminalCommand_handler import run_terminal_command
from .toolArgument_tool import (
    BrowserClickArguments,
    BrowserDownloadArguments,
    BrowserExtractArguments,
    BrowserHoverArguments,
    BrowserNavigateArguments,
    BrowserOpenArguments,
    BrowserScrollArguments,
    BrowserSelectArguments,
    BrowserSessionOpenArguments,
    BrowserSessionRefArguments,
    BrowserSubmitArguments,
    BrowserTypeArguments,
    BrowserUploadArguments,
    BrowserWaitArguments,
    CommandRunArguments,
    DirectoryListArguments,
    DocumentReadArguments,
    EditApplyArguments,
    EditProposalArguments,
    FileCreateArguments,
    FileReadArguments,
    FileSearchArguments,
    FileStatArguments,
    GitBranchNameArguments,
    GitCheckoutArguments,
    GitCommitArguments,
    GitCommitMessageArguments,
    GitDeleteBranchArguments,
    GitMergeArguments,
    GitPullArguments,
    GitPushArguments,
    GitReadArguments,
    KnowledgeSearchArguments,
    SecurityScanArguments,
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

TOOL_HANDLERS.update(
    {
        "git_create_branch": create_branch,
        "git_checkout": checkout_ref,
        "git_merge": merge_ref,
        "git_delete_branch": delete_branch,
        "git_pull": pull_remote,
        "git_generate_commit_message": generate_commit_message,
    }
)

register_tool(
    ToolDefinition(
        "git_create_branch", "Create a branch. Requires approval.", GitBranchNameArguments, True
    )
)
register_tool(
    ToolDefinition(
        "git_checkout", "Switch to a branch or ref. Requires approval.", GitCheckoutArguments, True
    )
)
register_tool(
    ToolDefinition(
        "git_merge", "Merge a ref into HEAD. Requires approval.", GitMergeArguments, True
    )
)
register_tool(
    ToolDefinition(
        "git_delete_branch",
        "Delete a branch. Requires approval.",
        GitDeleteBranchArguments,
        True,
    )
)
register_tool(
    ToolDefinition("git_pull", "Pull from a remote. Requires approval.", GitPullArguments, True)
)
register_tool(
    ToolDefinition(
        "git_generate_commit_message",
        "Draft a commit message from the diff. Read-only.",
        GitCommitMessageArguments,
        False,
    )
)

TOOL_HANDLERS.update({"security_scan": run_security_scan})

register_tool(
    ToolDefinition(
        "security_scan",
        "Run installed security scanners over the open project and read findings. Read-only.",
        SecurityScanArguments,
        False,
    )
)

TOOL_HANDLERS.update({"knowledge_search": run_knowledge_search})

register_tool(
    ToolDefinition(
        "knowledge_search",
        "Search OWL's own recorded tasks, memories, decisions, findings, verifications,"
        " changes, and commands. Returns prior knowledge as read-only data.",
        KnowledgeSearchArguments,
        False,
    )
)

BROWSER_TOOLS = (
    (
        open_browser_session,
        "browser_session_open",
        BrowserSessionOpenArguments,
        False,
        "Open an isolated browser session and navigate to a URL. Read-only, SSRF-guarded.",
    ),
    (
        navigate_browser_session,
        "browser_navigate",
        BrowserNavigateArguments,
        False,
        "Navigate the session to a new URL. Read-only, SSRF-guarded.",
    ),
    (
        browser_session_back,
        "browser_back",
        BrowserSessionRefArguments,
        False,
        "Go back in session history. Read-only.",
    ),
    (
        browser_session_forward,
        "browser_forward",
        BrowserSessionRefArguments,
        False,
        "Go forward in session history. Read-only.",
    ),
    (
        browser_session_reload,
        "browser_reload",
        BrowserSessionRefArguments,
        False,
        "Reload the current page. Read-only.",
    ),
    (
        close_browser_session,
        "browser_close",
        BrowserSessionRefArguments,
        False,
        "Close the browser session.",
    ),
    (
        extract_browser_page,
        "browser_extract",
        BrowserExtractArguments,
        False,
        "Extract page text, links, forms, structure or title as untrusted data. Read-only.",
    ),
    (
        screenshot_browser_page,
        "browser_screenshot",
        BrowserSessionRefArguments,
        False,
        "Capture a screenshot of the current page. Read-only.",
    ),
    (
        click_browser_target,
        "browser_click",
        BrowserClickArguments,
        False,
        "Click an element in the page. Audited.",
    ),
    (
        type_browser_target,
        "browser_type",
        BrowserTypeArguments,
        False,
        "Type text into an element. Audited.",
    ),
    (
        select_browser_target,
        "browser_select",
        BrowserSelectArguments,
        False,
        "Select a dropdown option. Audited.",
    ),
    (
        scroll_browser_page,
        "browser_scroll",
        BrowserScrollArguments,
        False,
        "Scroll the page. Audited.",
    ),
    (
        hover_browser_target,
        "browser_hover",
        BrowserHoverArguments,
        False,
        "Hover over an element. Audited.",
    ),
    (
        wait_browser_page,
        "browser_wait",
        BrowserWaitArguments,
        False,
        "Wait for a selector or a timeout. Audited.",
    ),
    (
        submit_browser_form,
        "browser_submit",
        BrowserSubmitArguments,
        True,
        "Submit a web form. External side effect. Requires approval.",
    ),
    (
        upload_browser_file,
        "browser_upload",
        BrowserUploadArguments,
        True,
        "Upload a workspace file to a page. External side effect. Requires approval.",
    ),
    (
        download_browser_file,
        "browser_download",
        BrowserDownloadArguments,
        True,
        "Download a file to the sandboxed download dir. External side effect. Requires approval.",
    ),
)

for browser_handler, browser_name, browser_model, browser_approval, browser_desc in BROWSER_TOOLS:
    TOOL_HANDLERS[browser_name] = browser_handler
    register_tool(ToolDefinition(browser_name, browser_desc, browser_model, browser_approval))

TOOL_HANDLERS.update({"document_read": document_read})

register_tool(
    ToolDefinition(
        "document_read",
        "Read and extract text from a project document (PDF, DOCX, XLSX, CSV, TXT)."
        " Returns extracted text and structure as untrusted data. Read-only.",
        DocumentReadArguments,
        False,
    )
)
