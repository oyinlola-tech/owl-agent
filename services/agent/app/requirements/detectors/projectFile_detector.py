from __future__ import annotations

import glob
import os
import re

from ...guards.commandRisk_guard import assess_command_risk


def read_text_file_or_empty(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except (OSError, UnicodeDecodeError):
        return ""


def any_file_exists(workspace: str, *names: str) -> bool:
    return any(os.path.exists(os.path.join(workspace, n)) for n in names)


def find_files_matching(workspace: str, *patterns: str) -> list[str]:
    matches: list[str] = []
    for pattern in patterns:
        matches.extend(
            os.path.relpath(p, workspace)
            for p in glob.glob(os.path.join(workspace, pattern))
            if os.path.isfile(p)
        )
    return sorted(set(matches))


def any_glob_matches(workspace: str, *patterns: str) -> bool:
    return bool(find_files_matching(workspace, *patterns))


def assess_package_script_risk(body: str) -> tuple[bool, str]:
    # Security: a package script is run by name, so its body is checked with the same risk
    # rules as any other command.
    for part in re.split(r"&&|\|\||;|\|", body):
        words = part.strip().split()
        if not words:
            continue
        verdict, reason = assess_command_risk(words)
        if verdict != "ok":
            return False, f"script runs a {verdict}-risk command ({reason})"
    return True, ""
