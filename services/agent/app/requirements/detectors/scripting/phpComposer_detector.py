from __future__ import annotations

import json
import os

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import (
    any_file_exists,
    assess_package_script_risk,
    read_text_file_or_empty,
)


def read_composer_test_script(workspace: str) -> str:
    raw = read_text_file_or_empty(os.path.join(workspace, "composer.json"))
    if not raw:
        return ""
    try:
        scripts = json.loads(raw).get("scripts", {})
    except (ValueError, AttributeError):
        return ""
    if not isinstance(scripts, dict):
        return ""
    body = scripts.get("test")
    if isinstance(body, list):
        body = " && ".join(str(part) for part in body)
    return body.strip() if isinstance(body, str) else ""


def detect_php_requirements(workspace: str) -> list[VerificationRequirement]:
    script = read_composer_test_script(workspace)
    if script:
        safe, why = assess_package_script_risk(script)
        return [
            VerificationRequirement(
                kind="tests",
                argv=("composer", "test"),
                cwd=".",
                source="project_manifest",
                detail="composer.json scripts.test",
                safe=safe,
                unsafe_reason=why,
                influences=("composer.json",),
                runs=script[:500],
            )
        ]
    if any_file_exists(workspace, "phpunit.xml", "phpunit.xml.dist", "phpunit.dist.xml"):
        return [
            VerificationRequirement(
                kind="tests",
                argv=("vendor/bin/phpunit",),
                cwd=".",
                source="project_configuration",
                detail="PHPUnit configuration",
                # Security: the PHPUnit config decides which suites and paths run.
                influences=("phpunit.xml", "phpunit.xml.dist", "phpunit.dist.xml", "composer.json"),
            )
        ]
    return []
