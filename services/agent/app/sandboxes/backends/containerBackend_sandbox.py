from __future__ import annotations

import os
import secrets
import shutil

from ..sandboxPolicy_sandbox import SandboxLaunch, SandboxPolicy

CONTAINER_HOST_ONLY_VARIABLES = {"PATH", "HOME", "TMPDIR", "PWD", "OLDPWD", "SHELL", "USER"}


def find_container_binary(engine: str) -> str | None:
    return shutil.which(engine)


def build_container_launch(
    policy: SandboxPolicy,
    engine: str,
    argv: list[str],
    workdir: str,
    workspace_root: str,
    network: bool,
    env: dict[str, str],
) -> SandboxLaunch:
    binary = find_container_binary(engine) or engine
    name = f"owl-sandbox-{secrets.token_hex(6)}"
    limits = policy.limits
    args = [
        binary,
        "run",
        "--rm",
        "--init",
        "--name",
        name,
        "--network",
        "bridge" if network else "none",
        "--security-opt",
        "no-new-privileges",
        "--cap-drop",
        "ALL",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--user",
        f"{os.getuid()}:{os.getgid()}" if hasattr(os, "getuid") else "1000:1000",
        "--volume",
        f"{workspace_root}:{workspace_root}:rw",
        "--workdir",
        workdir,
    ]
    if limits.max_processes > 0:
        args += ["--pids-limit", str(limits.max_processes)]
    if limits.memory_mb > 0:
        args += ["--memory", f"{limits.memory_mb}m"]
    if limits.open_files > 0:
        args += ["--ulimit", f"nofile={limits.open_files}:{limits.open_files}"]
    if limits.cpu_seconds > 0:
        args += ["--ulimit", f"cpu={limits.cpu_seconds}:{limits.cpu_seconds}"]
    for key in sorted(env):
        if key not in CONTAINER_HOST_ONLY_VARIABLES:
            args += ["--env", key]
    args += [policy.image, *argv]
    # Security: killing the CLI does not stop the container, so the caller removes it by name.
    return SandboxLaunch(
        argv=args,
        sandboxed=True,
        backend=engine,
        network=network,
        cleanup_argv=[binary, "rm", "-f", name],
    )
