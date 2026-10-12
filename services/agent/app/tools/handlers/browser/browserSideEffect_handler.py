from __future__ import annotations

from ....executors.browsing.browserSideEffect_executor import (
    download_file,
    submit_form,
    upload_file,
)
from ...toolArgument_tool import (
    BrowserDownloadArguments,
    BrowserSubmitArguments,
    BrowserUploadArguments,
)
from ...toolError_tool import ToolError


def require_active_session(ctx: dict):
    manager = ctx.get("browser_sessions")
    if manager is None:
        raise ToolError("browser session service unavailable")
    return manager.active_session(ctx["task_id"])


async def submit_browser_form(ctx: dict, args: BrowserSubmitArguments) -> dict:
    return await submit_form(require_active_session(ctx), args.target)


async def upload_browser_file(ctx: dict, args: BrowserUploadArguments) -> dict:
    auth = ctx.get("auth")
    if auth is None:
        raise ToolError("workspace guard unavailable")
    # Security: uploads may only read files inside the authorized project workspace; the
    # workspace guard canonicalizes the path and rejects traversal, symlinks and secrets.
    resolved = auth.resolve_authorized_path(args.path)
    return await upload_file(require_active_session(ctx), args.target, resolved)


async def download_browser_file(ctx: dict, args: BrowserDownloadArguments) -> dict:
    return await download_file(require_active_session(ctx), args.target)
