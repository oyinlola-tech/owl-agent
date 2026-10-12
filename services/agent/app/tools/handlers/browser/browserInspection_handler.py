from __future__ import annotations

from ....executors.browsing.browserExtraction_executor import extract_from_page
from ...toolArgument_tool import BrowserExtractArguments, BrowserSessionRefArguments
from ...toolError_tool import ToolError


def require_session_manager(ctx: dict):
    manager = ctx.get("browser_sessions")
    if manager is None:
        raise ToolError("browser session service unavailable")
    return manager


async def extract_browser_page(ctx: dict, args: BrowserExtractArguments) -> dict:
    session = require_session_manager(ctx).active_session(ctx["task_id"])
    return await extract_from_page(session, args.what)


async def screenshot_browser_page(ctx: dict, args: BrowserSessionRefArguments) -> dict:
    session = require_session_manager(ctx).active_session(ctx["task_id"])
    return await session.screenshot()
