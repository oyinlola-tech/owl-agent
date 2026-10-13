from __future__ import annotations

import os

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists, any_glob_matches

GRADLE_BUILD_FILES = ("build.gradle", "build.gradle.kts")
# Security: any Gradle or Maven build script can redefine the test task to do nothing, so the
# build files are recorded as taint sources for the checks they drive.
GRADLE_INFLUENCES = (
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "gradle.properties",
    "gradle/libs.versions.toml",
)
MAVEN_INFLUENCES = ("pom.xml", ".mvn/*", "mvnw", "mvnw.cmd")


def pick_gradle_launcher(workspace: str) -> tuple[tuple[str, ...], str]:
    if any_file_exists(workspace, "gradlew"):
        return ("./gradlew", "test"), "Gradle wrapper (gradlew)"
    return ("gradle", "test"), "gradle"


def detect_maven_gradle_requirements(workspace: str) -> list[VerificationRequirement]:
    found: list[VerificationRequirement] = []
    if any_file_exists(workspace, *GRADLE_BUILD_FILES):
        argv, which = pick_gradle_launcher(workspace)
        found.append(
            VerificationRequirement(
                kind="tests",
                argv=argv,
                cwd=".",
                source="project_manifest",
                detail=f"Gradle project ({which})",
                influences=GRADLE_INFLUENCES,
            )
        )
        return found
    if any_file_exists(workspace, "pom.xml"):
        launcher = ("./mvnw",) if any_file_exists(workspace, "mvnw") else ("mvn",)
        which = "Maven wrapper (mvnw)" if launcher[0] == "./mvnw" else "mvn"
        found.append(
            VerificationRequirement(
                kind="tests",
                argv=(*launcher, "-q", "test"),
                cwd=".",
                source="project_manifest",
                detail=f"pom.xml ({which})",
                influences=MAVEN_INFLUENCES,
            )
        )
    return found


def detect_kotlin_requirements(workspace: str) -> list[VerificationRequirement]:
    if any_file_exists(workspace, *GRADLE_BUILD_FILES, "pom.xml"):
        return []
    if not any_glob_matches(
        workspace, "*.kt", "*.kts", "src/*.kt", "src/*.kts", "src/**/*.kt", "src/**/*.kts"
    ):
        return []
    return [
        VerificationRequirement(
            kind="tests",
            argv=("kotlinc",),
            cwd=".",
            source="project_manifest",
            detail="Kotlin sources (kotlinc)",
            required=False,
            # Security: kotlin sources decide what gets compiled and checked.
            influences=("*.kt", "*.kts", "src/**/*.kt", "src/**/*.kts"),
        )
    ]


def detect_scala_sbt_requirements(workspace: str) -> list[VerificationRequirement]:
    if not any_file_exists(workspace, "build.sbt") and not os.path.isdir(
        os.path.join(workspace, "project")
    ):
        return []
    if not any_file_exists(workspace, "build.sbt"):
        return []
    launcher = ("./sbt",) if any_file_exists(workspace, "sbt") else ("sbt",)
    return [
        VerificationRequirement(
            kind="tests",
            argv=(*launcher, "test"),
            cwd=".",
            source="project_manifest",
            detail="build.sbt (sbt)",
            # Security: sbt build definition and plugins decide which tests run.
            influences=(
                "build.sbt",
                "project/*.sbt",
                "project/*.scala",
                "project/build.properties",
            ),
        )
    ]
