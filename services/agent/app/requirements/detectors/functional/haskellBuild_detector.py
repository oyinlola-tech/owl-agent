from __future__ import annotations

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists, any_glob_matches


def detect_haskell_requirements(workspace: str) -> list[VerificationRequirement]:
    if any_file_exists(workspace, "stack.yaml"):
        return [
            VerificationRequirement(
                kind="tests",
                argv=("stack", "test"),
                cwd=".",
                source="project_manifest",
                detail="stack.yaml",
                influences=("stack.yaml", "stack.yaml.lock", "*.cabal", "package.yaml"),
            )
        ]
    if any_glob_matches(workspace, "*.cabal") or any_file_exists(workspace, "cabal.project"):
        return [
            VerificationRequirement(
                kind="tests",
                argv=("cabal", "test"),
                cwd=".",
                source="project_manifest",
                detail="Cabal project",
                # Security: the cabal files declare which test suites exist and run.
                influences=("*.cabal", "cabal.project", "cabal.project.local"),
            )
        ]
    return []
