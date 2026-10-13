from __future__ import annotations

import os
import shutil

from ..sandboxPolicy_sandbox import (
    SYSTEM_ETC_PATHS,
    SYSTEM_READONLY_PATHS,
    SandboxLaunch,
    SandboxPolicy,
    SandboxUnavailableError,
    is_inside,
    list_toolchain_paths,
)


def find_bubblewrap_binary() -> str | None:
    return shutil.which("bwrap")


def find_prlimit_binary() -> str | None:
    prlimit = shutil.which("prlimit")
    if not prlimit or not is_inside(os.path.realpath(prlimit), "/usr"):
        return None
    return prlimit


def build_bubblewrap_rlimits(policy: SandboxPolicy) -> dict[str, int]:
    limits = policy.limits
    return {
        name: value
        for name, value in {"cpu": limits.cpu_seconds, "nofile": limits.open_files}.items()
        if value > 0
    }


def build_resource_limit_prefix(policy: SandboxPolicy) -> list[str]:
    # Security: prlimit runs INSIDE the new user namespace, where the process count starts
    # at zero, so a fork bomb hits the cap without counting the user's other processes.
    prlimit = find_prlimit_binary()
    if not prlimit:
        return []
    limits = policy.limits
    prefix = [prlimit]
    if limits.max_processes > 0:
        prefix.append(f"--nproc={limits.max_processes}")
    if limits.cpu_seconds > 0:
        prefix.append(f"--cpu={limits.cpu_seconds}")
    if limits.memory_mb > 0:
        prefix.append(f"--as={limits.memory_mb * 1024 * 1024}")
    if limits.open_files > 0:
        prefix.append(f"--nofile={limits.open_files}")
    return prefix + ["--"] if len(prefix) > 1 else []


def list_system_mount_arguments(policy: SandboxPolicy) -> list[str]:
    args: list[str] = []
    for path in SYSTEM_READONLY_PATHS:
        if os.path.islink(path):
            args += ["--symlink", os.readlink(path), path]
        elif os.path.exists(path):
            args += ["--ro-bind", path, path]
    for path in SYSTEM_ETC_PATHS + tuple(policy.extra_readonly_paths):
        args += ["--ro-bind-try", path, path]
    return args


def is_already_visible(path: str, bound: list[str]) -> bool:
    return any(is_inside(path, b) for b in bound)


def list_masking_arguments(
    policy: SandboxPolicy, bound: list[str], workspace_root: str
) -> list[str]:
    args: list[str] = []
    for hidden in policy.hidden_paths:
        if not os.path.lexists(hidden) or not is_already_visible(hidden, bound):
            continue
        if is_inside(workspace_root, hidden):
            continue
        if os.path.isdir(hidden):
            args += ["--tmpfs", hidden]
        else:
            args += ["--ro-bind", "/dev/null", hidden]
    return args


def build_bubblewrap_launch(
    policy: SandboxPolicy,
    argv: list[str],
    workdir: str,
    workspace_root: str,
    network: bool,
    executable: str | None,
) -> SandboxLaunch:
    bwrap = find_bubblewrap_binary() or "bwrap"
    args = [
        bwrap,
        "--die-with-parent",
        "--new-session",
        "--unshare-user",
        "--unshare-pid",
        "--unshare-ipc",
        "--unshare-uts",
        "--unshare-cgroup-try",
        "--hostname",
        "owl-sandbox",
    ]
    if not network:
        args.append("--unshare-net")
    args += list_system_mount_arguments(policy)
    args += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/var/tmp"]
    # Security: $HOME is an empty in-memory folder; only allowed toolchain folders and caches
    # are bound back in, read-only.
    args += ["--tmpfs", policy.home]
    visible = list(SYSTEM_READONLY_PATHS) + ["/tmp", "/var/tmp"]
    bound: list[str] = []
    for path in list(policy.home_readonly_paths) + list_toolchain_paths(executable):
        if is_already_visible(path, visible):
            continue
        args += ["--ro-bind-try", path, path]
        visible.append(path)
        bound.append(path)
    if executable and os.path.isabs(executable) and not is_already_visible(executable, visible):
        if not is_inside(executable, workspace_root):
            args += ["--ro-bind-try", executable, executable]
    args += ["--bind", workspace_root, workspace_root]
    bound.append(workspace_root)
    args += list_masking_arguments(policy, bound, workspace_root)
    args += ["--chdir", workdir, "--setenv", "TMPDIR", "/tmp", "--setenv", "HOME", policy.home]
    limits = policy.limits
    if (limits.max_processes > 0 or limits.memory_mb > 0) and find_prlimit_binary() is None:
        raise SandboxUnavailableError(
            "prlimit is not available; cannot enforce max_processes/memory limits"
            " in the bubblewrap sandbox"
        )
    args += ["--"] + build_resource_limit_prefix(policy) + list(argv)
    return SandboxLaunch(
        argv=args,
        sandboxed=True,
        backend="bubblewrap",
        network=network,
        rlimits=build_bubblewrap_rlimits(policy),
    )
