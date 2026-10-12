from __future__ import annotations

from ...toolArgument_tool import (
    BrowserNavigateArguments,
    BrowserSessionOpenArguments,
    BrowserSessionRefArguments,
)
from ...toolError_tool import ToolError


def require_session_manager(ctx: dict):
    manager = ctx.get("browser_sessions")
    if manager is None:
        raise ToolError("browser session service unavailable")
    return manager


async def open_browser_session(ctx: dict, args: BrowserSessionOpenArguments) -> dict:
    manager = require_session_manager(ctx)
    _session, result = await manager.open_session(ctx["task_id"], args.url)
    return result


async def navigate_browser_session(ctx: dict, args: BrowserNavigateArguments) -> dict:
    session = require_session_manager(ctx).active_session(ctx["task_id"])
    return await session.navigate(args.url)


async def browser_session_back(ctx: dict, args: BrowserSessionRefArguments) -> dict:
    session = require_session_manager(ctx).active_session(ctx["task_id"])
    return await session.go_back()


async def browser_session_forward(ctx: dict, args: BrowserSessionRefArguments) -> dict:
    session = require_session_manager(ctx).active_session(ctx["task_id"])
    return await session.go_forward()


async def browser_session_reload(ctx: dict, args: BrowserSessionRefArguments) -> dict:
    session = require_session_manager(ctx).active_session(ctx["task_id"])
    return await session.reload()


async def close_browser_session(ctx: dict, args: BrowserSessionRefArguments) -> dict:
    closed = await require_session_manager(ctx).close_session(ctx["task_id"])
    return {"closed": closed}
