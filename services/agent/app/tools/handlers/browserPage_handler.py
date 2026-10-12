from __future__ import annotations

from ..toolArgument_tool import BrowserOpenArguments
from ..toolError_tool import ToolError


async def open_browser_page(ctx: dict, args: BrowserOpenArguments) -> dict:
    service = ctx.get("browser")
    if service is None:
        raise ToolError("browser service unavailable")
    return await service.inspect_page(args.url, args.width, args.shot)
