from __future__ import annotations

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists

# Security: an out-of-source build directory under the workspace keeps generated artifacts out
# of the tracked sources; CMakeLists.txt still decides what is built and tested, so it is taint.
CMAKE_BUILD_DIR = "owl-verify-build"
CMAKE_PIPELINE = (
    f"cmake -S . -B {CMAKE_BUILD_DIR}"
    f" && cmake --build {CMAKE_BUILD_DIR}"
    f" && ctest --test-dir {CMAKE_BUILD_DIR} --output-on-failure"
)


def detect_cmake_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "CMakeLists.txt"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("sh", "-c", CMAKE_PIPELINE),
            cwd=".",
            source="project_manifest",
            detail="CMakeLists.txt (configure, build, ctest)",
            influences=("CMakeLists.txt", "CMakePresets.json", "*/CMakeLists.txt", "cmake/*"),
            runs=CMAKE_PIPELINE,
        )
    ]


def detect_swift_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "Package.swift"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("swift", "test"),
            cwd=".",
            source="project_manifest",
            detail="Package.swift (SwiftPM)",
            influences=("Package.swift", "Package.resolved"),
        )
    ]


def detect_zig_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "build.zig"):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("zig", "build", "test"),
            cwd=".",
            source="project_manifest",
            detail="build.zig",
            influences=("build.zig", "build.zig.zon"),
        )
    ]
