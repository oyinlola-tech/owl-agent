from __future__ import annotations

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists


def detect_elixir_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "mix.exs"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("mix", "test"),
            cwd=".",
            source="project_manifest",
            detail="mix.exs",
            # Security: mix.exs configures aliases and test paths that decide what runs.
            influences=("mix.exs", "mix.lock", "config/*.exs"),
        )
    ]
