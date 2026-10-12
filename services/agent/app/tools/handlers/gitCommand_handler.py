from __future__ import annotations

from ...executors.gitExecutor_executor import (
    commit_git_files,
    push_git_branch,
    read_git_branch,
    read_git_diff,
    read_git_log,
    read_git_status,
)
from ..toolArgument_tool import GitCommitArguments, GitPushArguments, GitReadArguments


async def show_git_status(ctx: dict, args: GitReadArguments) -> dict:
    return await read_git_status(ctx["exec"], args.path)


async def show_git_diff(ctx: dict, args: GitReadArguments) -> dict:
    return await read_git_diff(ctx["exec"], args.path, args.ref)


async def show_git_log(ctx: dict, args: GitReadArguments) -> dict:
    return await read_git_log(ctx["exec"], args.path, args.limit)


async def show_git_branch(ctx: dict, args: GitReadArguments) -> dict:
    return await read_git_branch(ctx["exec"], args.path)


async def commit_listed_files(ctx: dict, args: GitCommitArguments) -> dict:
    return await commit_git_files(ctx["exec"], args.path, list(args.files), args.message)


async def push_to_remote(ctx: dict, args: GitPushArguments) -> dict:
    # Security: network is granted only by an approval recorded as "with network access".
    network = bool((ctx.get("approval") or {}).get("network"))
    return await push_git_branch(ctx["exec"], args.path, args.remote, network, args.force)
