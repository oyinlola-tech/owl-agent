from __future__ import annotations

from ....executors.browsing.browserInteraction_executor import (
    click_target,
    hover_target,
    scroll_page,
    select_option_in_target,
    type_into_target,
    wait_on_page,
)
from ...toolArgument_tool import (
    BrowserClickArguments,
    BrowserHoverArguments,
    BrowserScrollArguments,
    BrowserSelectArguments,
    BrowserTypeArguments,
    BrowserWaitArguments,
)
from ...toolError_tool import ToolError


def require_active_session(ctx: dict):
    manager = ctx.get("browser_sessions")
    if manager is None:
        raise ToolError("browser session service unavailable")
    return manager.active_session(ctx["task_id"])


async def click_browser_target(ctx: dict, args: BrowserClickArguments) -> dict:
    return await click_target(require_active_session(ctx), args.target)


async def type_browser_target(ctx: dict, args: BrowserTypeArguments) -> dict:
    return await type_into_target(require_active_session(ctx), args.target, args.text)


async def select_browser_target(ctx: dict, args: BrowserSelectArguments) -> dict:
    return await select_option_in_target(require_active_session(ctx), args.target, args.value)


async def scroll_browser_page(ctx: dict, args: BrowserScrollArguments) -> dict:
    return await scroll_page(require_active_session(ctx), args.direction)


async def hover_browser_target(ctx: dict, args: BrowserHoverArguments) -> dict:
    return await hover_target(require_active_session(ctx), args.target)


async def wait_browser_page(ctx: dict, args: BrowserWaitArguments) -> dict:
    return await wait_on_page(require_active_session(ctx), args.selector, args.timeout_ms)
