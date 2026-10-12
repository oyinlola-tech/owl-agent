from __future__ import annotations

import re

PRIVILEGE_ESCALATION_PATTERN = re.compile(r"^\s*(sudo|su|doas|runas)\b", re.I)
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


def assess_command_risk(argv: list[str]) -> tuple[str, str]:
    if not argv or not argv[0].strip():
        return "refused", "empty executable"
    joined = " ".join(argv)
    if PRIVILEGE_ESCALATION_PATTERN.search(argv[0]):
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
