from __future__ import annotations

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists


def detect_solidity_requirements(workspace: str) -> list[VerificationRequirement]:
    found: list[VerificationRequirement] = []
    if any_file_exists(workspace, "foundry.toml"):
        found.append(
            VerificationRequirement(
                kind="tests",
                argv=("forge", "test"),
                cwd=".",
                source="project_manifest",
                detail="foundry.toml (Foundry)",
                # Security: foundry.toml and remappings decide which contracts and tests compile.
                influences=("foundry.toml", "remappings.txt"),
            )
        )
    if any_file_exists(
        workspace,
        "hardhat.config.js",
        "hardhat.config.ts",
        "hardhat.config.cjs",
        "hardhat.config.mjs",
    ):
        found.append(
            VerificationRequirement(
                kind="tests",
                argv=("npx", "hardhat", "test"),
                cwd=".",
                source="project_manifest",
                detail="hardhat.config (Hardhat)",
                # Security: hardhat config and package.json decide which tests run.
                influences=(
                    "hardhat.config.js",
                    "hardhat.config.ts",
                    "hardhat.config.cjs",
                    "hardhat.config.mjs",
                    "package.json",
                ),
            )
        )
    return found
