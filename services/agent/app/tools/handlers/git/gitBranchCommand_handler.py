from __future__ import annotations

from ....executors.gitExecutor_executor import (
    checkout_git_ref,
    create_git_branch,
    delete_git_branch,
    merge_git_ref,
    pull_git_remote,
)
from ...toolArgument_tool import (
    GitBranchNameArguments,
    GitCheckoutArguments,
    GitDeleteBranchArguments,
    GitMergeArguments,
    GitPullArguments,
)


async def create_branch(ctx: dict, args: GitBranchNameArguments) -> dict:
    return await create_git_branch(ctx["exec"], args.path, args.name)


async def checkout_ref(ctx: dict, args: GitCheckoutArguments) -> dict:
    return await checkout_git_ref(ctx["exec"], args.path, args.ref, args.confirm_discard)


async def merge_ref(ctx: dict, args: GitMergeArguments) -> dict:
    return await merge_git_ref(ctx["exec"], args.path, args.ref)


async def delete_branch(ctx: dict, args: GitDeleteBranchArguments) -> dict:
    return await delete_git_branch(ctx["exec"], args.path, args.name, args.force)


async def pull_remote(ctx: dict, args: GitPullArguments) -> dict:
    # Security: network is granted only by an approval recorded as "with network access".
    network = bool((ctx.get("approval") or {}).get("network"))
    return await pull_git_remote(ctx["exec"], args.path, args.remote, network)
