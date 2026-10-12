from __future__ import annotations

import os
import re

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import read_text_file_or_empty

FLUTTER_PUBSPEC_PATTERN = re.compile(r"^\s*(flutter\s*:|sdk\s*:\s*flutter)", re.M)


def detect_flutter_dart_requirements(workspace: str) -> list[VerificationRequirement]:
    pubspec = read_text_file_or_empty(os.path.join(workspace, "pubspec.yaml"))
    if not pubspec:
        return []
    is_flutter = bool(FLUTTER_PUBSPEC_PATTERN.search(pubspec))
    argv = ("flutter", "test") if is_flutter else ("dart", "test")
    detail = "pubspec.yaml (Flutter)" if is_flutter else "pubspec.yaml (Dart)"
    return [
        VerificationRequirement(
            kind="tests",
            argv=argv,
            cwd=".",
            source="project_manifest",
            detail=detail,
            influences=("pubspec.yaml", "pubspec.lock", "dart_test.yaml"),
        )
    ]
