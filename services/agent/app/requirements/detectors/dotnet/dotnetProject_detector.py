from __future__ import annotations

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_glob_matches


def detect_dotnet_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_glob_matches(workspace, "*.sln", "*.csproj", "*.fsproj", "*.vbproj"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("dotnet", "test"),
            cwd=".",
            source="project_manifest",
            detail=".NET project (dotnet test)",
            # Security: project and props files decide which test projects and frameworks run.
            influences=(
                "*.sln",
                "*.csproj",
                "*.fsproj",
                "*.vbproj",
                "Directory.Build.props",
                "Directory.Build.targets",
            ),
        )
    ]
