from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import asdict
from fnmatch import fnmatch

from .detectors.buildToolchain_detector import (
    detect_go_requirements,
    detect_makefile_requirements,
    detect_rust_requirements,
)
from .detectors.nodeScript_detector import detect_node_requirements
from .detectors.pythonProject_detector import detect_python_requirements
from .verificationRequirement_requirement import (
    REQUIREMENT_KIND_ORDER,
    DetectionResult,
    VerificationRequirement,
)

LANGUAGE_DETECTORS: tuple[Callable[[str], list[VerificationRequirement]], ...] = (
    detect_node_requirements,
    detect_python_requirements,
    detect_go_requirements,
    detect_rust_requirements,
)
FALLBACK_DETECTORS: tuple[Callable[[str], list[VerificationRequirement]], ...] = (
    detect_makefile_requirements,
)


def detect_verification_requirements(workspace: str, timeout: float = 600.0) -> DetectionResult:
    if not workspace or not os.path.isdir(workspace):
        return DetectionResult([], "The task has no authorized workspace to verify.")
    found: list[VerificationRequirement] = []
    for detector in LANGUAGE_DETECTORS:
        found.extend(detector(workspace))
    if not any(r.kind == "tests" for r in found):
        for detector in FALLBACK_DETECTORS:
            found.extend(detector(workspace))
    found = [
        VerificationRequirement(**{**asdict(r), "timeout": timeout}) if r.timeout != timeout else r
        for r in found
    ]
    found.sort(key=lambda r: (REQUIREMENT_KIND_ORDER.get(r.kind, 9), r.label))
    if not found:
        return DetectionResult([], "No reliable project verification command was detected.")
    if not any(r.safe and r.required for r in found):
        unsafe = "; ".join(f"{r.label}: {r.unsafe_reason}" for r in found if not r.safe)
        reason = (
            "Detected checks are optional only."
            if not unsafe
            else (f"Detected checks were not safe to run automatically ({unsafe}).")
        )
        return DetectionResult(found, reason)
    return DetectionResult(found)


def find_tainting_changes(req: VerificationRequirement, changed: list[str]) -> list[str]:
    return sorted({path for path in changed for pat in req.influences if fnmatch(path, pat)})


def detect_first_test_command(workspace: str) -> tuple[list[str], str] | None:
    for req in detect_verification_requirements(workspace).safe_requirements:
        if req.kind == "tests":
            return list(req.argv), req.detail
    return None
