from __future__ import annotations

from ..toolArgument_tool import CommandRunArguments
from ..toolError_tool import ToolError


async def run_terminal_command(ctx: dict, args: CommandRunArguments) -> dict:
    service = ctx.get("exec")
    if service is None:
        raise ToolError("execution service unavailable")
    # Security: network is granted only by an approval recorded as "with network access".
    network = bool((ctx.get("approval") or {}).get("network"))
    return await service.run_command(
        ctx["task_id"], list(args.argv), args.cwd or ".", args.timeout, network=network
    )
