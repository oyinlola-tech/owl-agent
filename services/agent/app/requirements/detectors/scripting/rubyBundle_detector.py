from __future__ import annotations

import os
import re

from ...verificationRequirement_requirement import VerificationRequirement
from ..projectFile_detector import any_file_exists, read_text_file_or_empty

RAKE_TEST_TASK_PATTERN = re.compile(r"""task\s+:?["']?test["']?""")


def has_rspec_evidence(workspace: str) -> bool:
    if any_file_exists(workspace, ".rspec") or os.path.isdir(os.path.join(workspace, "spec")):
        return True
    gemfile = read_text_file_or_empty(os.path.join(workspace, "Gemfile"))
    return "rspec" in gemfile.lower()


def detect_ruby_requirements(workspace: str) -> list[VerificationRequirement]:
    has_bundler = any_file_exists(workspace, "Gemfile")
    prefix: tuple[str, ...] = ("bundle", "exec") if has_bundler else ()
    # Security: the Gemfile, Rakefile and RSpec config decide which tests run.
    influences = (
        "Gemfile",
        "Gemfile.lock",
        ".rspec",
        "Rakefile",
        "*.gemspec",
        "spec/spec_helper.rb",
    )
    if has_rspec_evidence(workspace):
        return [
            VerificationRequirement(
                kind="tests",
                argv=(*prefix, "rspec"),
                cwd=".",
                source="project_configuration",
                detail="RSpec suite" + (" (bundler)" if has_bundler else ""),
                influences=influences,
            )
        ]
    rakefile = read_text_file_or_empty(os.path.join(workspace, "Rakefile"))
    if RAKE_TEST_TASK_PATTERN.search(rakefile):
        return [
            VerificationRequirement(
                kind="tests",
                argv=(*prefix, "rake", "test"),
                cwd=".",
                source="project_configuration",
                detail="Rake test task" + (" (bundler)" if has_bundler else ""),
                influences=influences,
            )
        ]
    return []
