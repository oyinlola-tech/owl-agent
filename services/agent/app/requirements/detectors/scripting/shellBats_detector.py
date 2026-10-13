from __future__ import annotations

import os

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists, find_files_matching

BATS_SEARCH_DIRS = (".", "test", "tests", "bats")


def find_bats_directory(workspace: str) -> str:
    for folder in BATS_SEARCH_DIRS:
        base = os.path.join(workspace, folder)
        if os.path.isdir(base) and find_files_matching(base, "*.bats"):
            return folder
    return ""


def detect_shell_requirements(workspace: str) -> list[VerificationRequirement]:
    found: list[VerificationRequirement] = []
    bats_dir = find_bats_directory(workspace)
    if bats_dir:
        found.append(
            VerificationRequirement(
                kind="tests",
                argv=("bats", "-r", bats_dir),
                cwd=".",
                source="project_configuration",
                detail=f"Bats tests in {bats_dir}",
                # Security: Bats helper and setup files decide what each test actually does.
                influences=("*.bats", f"{bats_dir}/*.bats", f"{bats_dir}/*.bash"),
            )
        )
    sh_files = find_files_matching(workspace, "*.sh")
    if any_file_exists(workspace, ".shellcheckrc") or sh_files:
        targets = tuple(sh_files[:25]) if sh_files else ("-r", ".")
        found.append(
            VerificationRequirement(
                kind="lint",
                argv=("shellcheck", "-x", *targets),
                cwd=".",
                source="project_configuration",
                detail="ShellCheck on shell scripts",
                required=False,
                influences=(".shellcheckrc", "*.sh"),
            )
        )
    return found
