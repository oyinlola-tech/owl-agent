from __future__ import annotations

import os
import re

from ..verificationRequirement_requirement import VerificationRequirement
from .projectFile_detector import any_file_exists, read_text_file_or_empty


def detect_go_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "go.mod"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("go", "test", "./..."),
            cwd=".",
            source="project_manifest",
            detail="go.mod",
            influences=("go.mod",),
        ),
        VerificationRequirement(
            kind="lint",
            argv=("go", "vet", "./..."),
            cwd=".",
            source="project_manifest",
            detail="go.mod",
            required=False,
            influences=("go.mod", "go.sum"),
        ),
    ]


def detect_rust_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "Cargo.toml"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("cargo", "test"),
            cwd=".",
            source="project_manifest",
            detail="Cargo.toml",
            influences=("Cargo.toml", "Cargo.lock", "build.rs"),
        )
    ]


def detect_makefile_requirements(workspace: str) -> list[VerificationRequirement]:
    makefile = read_text_file_or_empty(os.path.join(workspace, "Makefile"))
    if not re.search(r"^test\s*:", makefile, re.M):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("make", "test"),
            cwd=".",
            source="project_configuration",
            detail="Makefile test target",
            influences=("Makefile",),
        )
    ]
