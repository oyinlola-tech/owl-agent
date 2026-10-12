from __future__ import annotations

import json
import os
import re

from ..verificationRequirement_requirement import RequirementKind, VerificationRequirement
from .projectFile_detector import (
    any_file_exists,
    assess_package_script_risk,
    read_text_file_or_empty,
)

# Security: npm's placeholder test script must never count as a test suite.
NPM_PLACEHOLDER_TEST_PATTERN = re.compile(r"no test specified", re.I)

NODE_VERIFICATION_SCRIPTS: tuple[tuple[str, RequirementKind, bool], ...] = (
    ("typecheck", "typecheck", True),
    ("type-check", "typecheck", True),
    ("test", "tests", True),
    ("build", "build", True),
    ("lint", "lint", False),
)


def pick_node_package_manager(workspace: str) -> str:
    if any_file_exists(workspace, "pnpm-lock.yaml"):
        return "pnpm"
    if any_file_exists(workspace, "yarn.lock"):
        return "yarn"
    if any_file_exists(workspace, "bun.lockb", "bun.lock"):
        return "bun"
    return "npm"


def detect_node_requirements(workspace: str) -> list[VerificationRequirement]:
    raw = read_text_file_or_empty(os.path.join(workspace, "package.json"))
    if not raw:
        return []
    try:
        scripts = json.loads(raw).get("scripts", {})
    except (ValueError, AttributeError):
        return []
    if not isinstance(scripts, dict):
        return []
    pm = pick_node_package_manager(workspace)
    found: list[VerificationRequirement] = []
    kinds_seen: set[str] = set()
    for name, kind, required in NODE_VERIFICATION_SCRIPTS:
        body = scripts.get(name)
        if not isinstance(body, str) or not body.strip() or kind in kinds_seen:
            continue
        if name == "test" and NPM_PLACEHOLDER_TEST_PATTERN.search(body):
            continue
        kinds_seen.add(kind)
        safe, why = assess_package_script_risk(body)
        found.append(
            VerificationRequirement(
                kind=kind,
                argv=(pm, "run", name),
                cwd=".",
                source="project_manifest",
                detail=f"package.json scripts.{name} ({pm})",
                required=required,
                safe=safe,
                unsafe_reason=why,
                influences=("package.json",),
                runs=body.strip()[:500],
            )
        )
    return found
