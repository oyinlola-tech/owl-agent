from __future__ import annotations

import os
import shutil

from ..sandboxPolicy_sandbox import SandboxLaunch, SandboxPolicy, list_toolchain_paths

SEATBELT_BINARY = "/usr/bin/sandbox-exec"


def find_seatbelt_binary() -> str | None:
    if os.path.isfile(SEATBELT_BINARY):
        return SEATBELT_BINARY
    return shutil.which("sandbox-exec")


def quote_profile_path(path: str) -> str:
    return '"' + os.path.realpath(path).replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_seatbelt_profile(
    policy: SandboxPolicy, workspace_root: str, network: bool, executable: str | None
) -> str:
    # Security: SBPL applies the LAST matching rule, so broad denies come first, then the
    # narrow allows, then the credential stores are denied again on top.
    workspace = quote_profile_path(workspace_root)
    readable = [workspace] + [
        quote_profile_path(p)
        for p in list(policy.home_readonly_paths) + list_toolchain_paths(executable)
    ]
    lines = [
        "(version 1)",
        "(allow default)",
        "(deny file-write*)",
        f'(allow file-write* (subpath {workspace}) (subpath (param "TMP"))'
        ' (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/fd/"))',
        f"(deny file-read* (subpath {quote_profile_path(policy.home)}))",
        "(allow file-read* " + " ".join(f"(subpath {p})" for p in readable) + ")",
    ]
    hidden = " ".join(f"(subpath {quote_profile_path(p)})" for p in policy.hidden_paths)
    if hidden:
        lines.append(f"(deny file-read* file-write* {hidden})")
    if not network:
        lines.append("(deny network*)")
        lines.append(
            '(allow network* (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))'
        )
    return "\n".join(lines)


def build_seatbelt_launch(
    policy: SandboxPolicy,
    argv: list[str],
    workspace_root: str,
    network: bool,
    executable: str | None,
    temp_dir: str,
) -> SandboxLaunch:
    profile = build_seatbelt_profile(policy, workspace_root, network, executable)
    binary = find_seatbelt_binary() or SEATBELT_BINARY
    limits = policy.limits
    # Security: macOS counts processes per real user, so only per-process limits are safe here.
    rlimits = {"cpu": limits.cpu_seconds, "nofile": limits.open_files}
    return SandboxLaunch(
        argv=[binary, "-D", f"TMP={os.path.realpath(temp_dir)}", "-p", profile, *argv],
        sandboxed=True,
        backend="sandbox-exec",
        network=network,
        rlimits={k: v for k, v in rlimits.items() if v > 0},
    )
