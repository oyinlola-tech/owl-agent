from __future__ import annotations

import os
import re
import shlex

PRIVILEGE_ESCALATION_PATTERN = re.compile(r"^\s*(sudo|su|doas|runas)\b", re.I)
PRIVILEGE_ESCALATION_PROGRAMS = frozenset({"sudo", "su", "doas", "runas", "pkexec", "sudoedit"})
COMMAND_WRAPPER_PROGRAMS = frozenset(
    {
        "env",
        "nice",
        "nohup",
        "timeout",
        "stdbuf",
        "ionice",
        "command",
        "exec",
        "time",
        "setsid",
        "chrt",
        "taskset",
        "xargs",
        "busybox",
    }
)
WRAPPER_OPTIONS_WITH_VALUES = {
    "env": {"-u", "-C", "-S", "--unset", "--chdir", "--split-string"},
    "nice": {"-n", "--adjustment"},
    "timeout": {"-s", "-k", "--signal", "--kill-after"},
    "ionice": {"-c", "-n", "-p", "--class", "--classdata", "--pid"},
    "stdbuf": {"-i", "-o", "-e", "--input", "--output", "--error"},
    "chrt": {"-p", "--pid"},
    "xargs": {"-n", "-I", "-L", "-P", "-d", "-E", "-s", "-a", "--max-args", "--arg-file"},
}
WRAPPER_PLAIN_ARGUMENT_PATTERN = re.compile(r"^(\d+(\.\d+)?[smhd]?|0x[0-9a-fA-F]+)$")
SHELL_PROGRAMS = frozenset({"sh", "bash", "dash", "zsh", "ksh", "fish", "ash"})
SHELL_COMMAND_SEPARATOR_PATTERN = re.compile(r"&&|\|\||;|\||\n|`|\$\(")
HIGH_RISK_PATTERNS = (
    re.compile(r"\brm\s+.*-[a-z]*r", re.I),
    re.compile(r"\b(mkfs|dd|fdisk|parted)\b", re.I),
    re.compile(r"\b(chmod|chown)\b", re.I),
    re.compile(r"\b(apt|apt-get|dnf|yum|pacman|brew)\b.*\binstall\b", re.I),
    re.compile(r"\b(pip|npm|pnpm|yarn|uv|go|cargo)\b.*\binstall\b", re.I),
    re.compile(r"\b(curl|wget)\b", re.I),
    re.compile(r"\b(systemctl|service)\b", re.I),
    re.compile(r"\b(shutdown|reboot|halt|poweroff)\b", re.I),
)


def program_name_of(token: str) -> str:
    return os.path.basename(token.strip()).lower()


def list_programs_a_command_would_run(argv: list[str], depth: int = 0) -> list[str]:
    # Security: "sudo" can hide behind a path (/usr/bin/sudo), a wrapper (env, nice,
    # timeout, ...) or a shell (sh -c "sudo ..."), so look through all three.
    if depth > 4 or not argv:
        return []
    name = program_name_of(argv[0])
    programs = [name]
    rest = argv[1:]
    if name in COMMAND_WRAPPER_PROGRAMS:
        takes_value = WRAPPER_OPTIONS_WITH_VALUES.get(name, set())
        index = 0
        while index < len(rest):
            token = rest[index]
            if token in takes_value:
                index += 2
            elif (
                token.startswith("-") or "=" in token or WRAPPER_PLAIN_ARGUMENT_PATTERN.match(token)
            ):
                index += 1
            else:
                break
        programs += list_programs_a_command_would_run(rest[index:], depth + 1)
    elif name in SHELL_PROGRAMS and "-c" in rest:
        script_index = rest.index("-c") + 1
        script = rest[script_index] if script_index < len(rest) else ""
        for piece in SHELL_COMMAND_SEPARATOR_PATTERN.split(script):
            try:
                words = shlex.split(piece)
            except ValueError:
                words = piece.split()
            programs += list_programs_a_command_would_run(words, depth + 1)
    return programs


def assess_command_risk(argv: list[str]) -> tuple[str, str]:
    if not argv or not argv[0].strip():
        return "refused", "empty executable"
    joined = " ".join(argv)
    if PRIVILEGE_ESCALATION_PATTERN.search(argv[0]) or (
        set(list_programs_a_command_would_run(argv)) & PRIVILEGE_ESCALATION_PROGRAMS
    ):
        return "refused", "privilege escalation is out of scope"
    for pattern in HIGH_RISK_PATTERNS:
        if pattern.search(joined):
            return "high", f"matches high-risk pattern {pattern.pattern}"
    return "ok", ""


NETWORK_COMMAND_PATTERNS = (
    re.compile(r"\b(curl|wget|ssh|scp|sftp|rsync|ftp|telnet|nc|ncat)\b", re.I),
    re.compile(r"\bgit\s+(.*\s)?(push|fetch|pull|clone|ls-remote|submodule)\b", re.I),
    re.compile(
        r"\b(pip|pip3|npm|pnpm|yarn|uv|cargo|gem|bundle|composer|poetry)\b.*\b(install|add|update|upgrade|sync|fetch|download|publish|ci)\b",
        re.I,
    ),
    re.compile(r"\bgo\s+(get|install|mod\s+download)\b", re.I),
    re.compile(r"\b(apt|apt-get|dnf|yum|pacman|brew|snap|flatpak)\b", re.I),
    re.compile(r"\b(docker|podman)\s+(pull|push|login|build|run)\b", re.I),
    re.compile(r"^(npx|pnpx|bunx)$", re.I),
)


def command_needs_network(argv: list[str]) -> bool:
    # Security: decides whether a command may even be offered network access. It still only
    # gets it after an approval that explicitly says "with network access".
    if not argv:
        return False
    joined = " ".join(argv)
    name = argv[0].rsplit("/", 1)[-1]
    return any(p.search(joined) or p.search(name) for p in NETWORK_COMMAND_PATTERNS)
