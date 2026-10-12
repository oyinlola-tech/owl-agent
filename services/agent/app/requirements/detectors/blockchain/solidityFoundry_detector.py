from __future__ import annotations

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists


def detect_solidity_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "foundry.toml"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("forge", "test"),
            cwd=".",
            source="project_manifest",
            detail="foundry.toml (Foundry)",
            # Security: foundry.toml and remappings decide which contracts and tests compile.
            influences=("foundry.toml", "remappings.txt"),
        )
    ]
