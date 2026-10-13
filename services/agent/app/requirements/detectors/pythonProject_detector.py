from __future__ import annotations

import os
import re
import sys
import tomllib

from ..verificationRequirement_requirement import VerificationRequirement
from .projectFile_detector import any_file_exists, read_text_file_or_empty


def pick_python_interpreter(workspace: str) -> tuple[str, str]:
    for venv in (".venv", "venv", "env"):
        candidate = os.path.join(workspace, venv, "bin", "python")
        if os.path.isfile(candidate):
            return os.path.join(venv, "bin", "python"), f"{venv} interpreter"
    return sys.executable, "OWL's interpreter (no project virtualenv found)"


def detect_python_requirements(workspace: str) -> list[VerificationRequirement]:
    pyproject_text = read_text_file_or_empty(os.path.join(workspace, "pyproject.toml"))
    try:
        pyproject = tomllib.loads(pyproject_text) if pyproject_text else {}
    except tomllib.TOMLDecodeError:
        pyproject = {}
    tool = pyproject.get("tool", {}) if isinstance(pyproject, dict) else {}
    setup_cfg = read_text_file_or_empty(os.path.join(workspace, "setup.cfg"))
    tox_ini = read_text_file_or_empty(os.path.join(workspace, "tox.ini"))

    pytest_evidence = ""
    if "pytest" in tool:
        pytest_evidence = "pyproject.toml [tool.pytest]"
    elif any_file_exists(workspace, "pytest.ini"):
        pytest_evidence = "pytest.ini"
    elif "[tool:pytest]" in setup_cfg:
        pytest_evidence = "setup.cfg [tool:pytest]"
    elif "[pytest]" in tox_ini:
        pytest_evidence = "tox.ini [pytest]"
    elif any_file_exists(workspace, "conftest.py", os.path.join("tests", "conftest.py")):
        pytest_evidence = "conftest.py"
    elif re.search(
        r"\bpytest\b",
        pyproject_text
        + read_text_file_or_empty(os.path.join(workspace, "requirements.txt"))
        + read_text_file_or_empty(os.path.join(workspace, "requirements-dev.txt")),
    ):
        pytest_evidence = "pytest listed as a dependency"
    else:
        tests_dir = os.path.join(workspace, "tests")
        candidates = [workspace] + ([tests_dir] if os.path.isdir(tests_dir) else [])
        for folder in candidates:
            try:
                names = os.listdir(folder)
            except OSError:
                continue
            if any(
                n.endswith(".py") and (n.startswith("test_") or n.endswith("_test.py"))
                for n in names
            ):
                pytest_evidence = "pytest-style test files"
                break

    found: list[VerificationRequirement] = []
    if not (pytest_evidence or "ruff" in tool or "mypy" in tool):
        return found
    python, which = pick_python_interpreter(workspace)
    # Security: the interpreter itself decides what runs, so a task-written virtualenv taints too.
    interp = ("*venv/*", "env/*")
    if pytest_evidence:
        found.append(
            VerificationRequirement(
                kind="tests",
                argv=(python, "-m", "pytest", "-q"),
                cwd=".",
                source="project_configuration"
                if "files" not in pytest_evidence
                else "owl_inferred",
                detail=f"{pytest_evidence}; {which}",
                # Security: config and conftest files can skip or rewrite every test.
                influences=(
                    "pyproject.toml",
                    "pytest.ini",
                    "setup.cfg",
                    "tox.ini",
                    "conftest.py",
                    "*/conftest.py",
                    *interp,
                ),
            )
        )
    if "mypy" in tool or any_file_exists(workspace, "mypy.ini"):
        found.append(
            VerificationRequirement(
                kind="typecheck",
                argv=(python, "-m", "mypy", "."),
                cwd=".",
                source="project_configuration",
                detail=f"mypy configuration; {which}",
                influences=("pyproject.toml", "mypy.ini", "setup.cfg", *interp),
            )
        )
    if "ruff" in tool or any_file_exists(workspace, "ruff.toml", ".ruff.toml"):
        found.append(
            VerificationRequirement(
                kind="lint",
                argv=(python, "-m", "ruff", "check", "."),
                cwd=".",
                source="project_configuration",
                detail=f"ruff configuration; {which}",
                required=False,
                influences=("pyproject.toml", "ruff.toml", ".ruff.toml", *interp),
            )
        )
    return found
