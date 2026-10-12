import asyncio
import json
import os
import sys
import time

import pytest
from supports.verificationDriver_support import is_process_alive

from app.executors.commandExecutor_executor import CommandExecutor, CommandTimedOutError
from app.guards.environmentScrub_guard import build_environment_without_secrets
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.requirements.requirementDetection_requirement import (
    detect_first_test_command,
    detect_verification_requirements,
)


def write_workspace_file(ws, name, text):
    path = ws / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def summarize_requirements(result):
    return [(r.kind, r.label, r.required, r.safe) for r in result.requirements]


def test_no_workspace_or_empty_project(tmp_path):
    assert detect_verification_requirements("").reason
    result = detect_verification_requirements(str(tmp_path))
    assert result.requirements == []
    assert "No reliable" in result.reason
    assert detect_first_test_command(str(tmp_path)) is None


def test_npm_placeholder_test_script_ignored(tmp_path):
    write_workspace_file(
        tmp_path,
        "package.json",
        json.dumps({"scripts": {"test": 'echo "Error: no test specified" && exit 1'}}),
    )
    result = detect_verification_requirements(str(tmp_path))
    assert result.requirements == []


def test_node_scripts_ordered_and_lint_optional(tmp_path):
    scripts = {
        "test": "vitest run",
        "build": "vite build",
        "typecheck": "tsc --noEmit",
        "lint": "x",
    }
    write_workspace_file(tmp_path, "package.json", json.dumps({"scripts": scripts}))
    result = detect_verification_requirements(str(tmp_path))
    assert summarize_requirements(result) == [
        ("typecheck", "npm run typecheck", True, True),
        ("tests", "npm run test", True, True),
        ("build", "npm run build", True, True),
        ("lint", "npm run lint", False, True),
    ]
    assert all(r.source == "project_manifest" for r in result.requirements)


@pytest.mark.parametrize(
    ("lockfile", "manager"),
    [("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("bun.lockb", "bun"), ("bun.lock", "bun")],
)
def test_lockfile_picks_package_manager(tmp_path, lockfile, manager):
    write_workspace_file(tmp_path, "package.json", json.dumps({"scripts": {"test": "jest"}}))
    write_workspace_file(tmp_path, lockfile, "")
    result = detect_verification_requirements(str(tmp_path))
    assert result.requirements[0].argv == (manager, "run", "test")


def test_unsafe_package_script_not_runnable(tmp_path):
    write_workspace_file(
        tmp_path, "package.json", json.dumps({"scripts": {"test": "rm -rf / && jest"}})
    )
    result = detect_verification_requirements(str(tmp_path))
    (req,) = result.requirements
    assert req.safe is False and "high-risk" in req.unsafe_reason
    assert result.safe_requirements == []
    assert "not safe" in result.reason


def test_requirements_txt_alone_does_not_imply_pytest(tmp_path):
    write_workspace_file(tmp_path, "requirements.txt", "requests\n")
    assert detect_verification_requirements(str(tmp_path)).requirements == []


@pytest.mark.parametrize(
    ("name", "text", "evidence"),
    [
        ("pytest.ini", "[pytest]\n", "pytest.ini"),
        ("pyproject.toml", "[tool.pytest.ini_options]\n", "[tool.pytest]"),
        ("setup.cfg", "[tool:pytest]\n", "setup.cfg"),
        ("conftest.py", "", "conftest.py"),
        ("test_x.py", "def test_x():\n    pass\n", "test files"),
    ],
)
def test_pytest_evidence(tmp_path, name, text, evidence):
    write_workspace_file(tmp_path, name, text)
    result = detect_verification_requirements(str(tmp_path))
    (req,) = result.requirements
    assert req.kind == "tests" and req.argv[1:] == ("-m", "pytest", "-q")
    assert evidence in req.detail
    expected = "owl_inferred" if evidence == "test files" else "project_configuration"
    assert req.source == expected


def test_python_prefers_project_venv(tmp_path):
    write_workspace_file(tmp_path, "pytest.ini", "[pytest]\n")
    write_workspace_file(tmp_path, ".venv/bin/python", "")
    (req,) = detect_verification_requirements(str(tmp_path)).requirements
    assert req.argv[0] == os.path.join(".venv", "bin", "python")


def test_python_mypy_and_ruff(tmp_path):
    write_workspace_file(
        tmp_path, "pyproject.toml", "[tool.pytest.ini_options]\n[tool.mypy]\n[tool.ruff]\n"
    )
    got = [
        (r.kind, r.required) for r in detect_verification_requirements(str(tmp_path)).requirements
    ]
    assert got == [("typecheck", True), ("tests", True), ("lint", False)]


def test_go_and_rust(tmp_path):
    go = tmp_path / "go"
    write_workspace_file(go, "go.mod", "module x\n")
    assert [r.label for r in detect_verification_requirements(str(go)).requirements] == [
        "go test ./...",
        "go vet ./...",
    ]
    rust = tmp_path / "rust"
    write_workspace_file(rust, "Cargo.toml", "[package]\n")
    assert [r.label for r in detect_verification_requirements(str(rust)).requirements] == [
        "cargo test"
    ]


def test_makefile_only_as_fallback(tmp_path):
    make = tmp_path / "make"
    write_workspace_file(make, "Makefile", "test:\n\techo ok\n")
    assert [r.label for r in detect_verification_requirements(str(make)).requirements] == [
        "make test"
    ]
    both = tmp_path / "both"
    write_workspace_file(both, "Makefile", "test:\n\techo ok\n")
    write_workspace_file(both, "go.mod", "module x\n")
    labels = [r.label for r in detect_verification_requirements(str(both)).requirements]
    assert "make test" not in labels and "go test ./..." in labels


def test_requirement_ids_are_stable_and_command_specific(tmp_path):
    write_workspace_file(tmp_path, "pytest.ini", "[pytest]\n")
    a = detect_verification_requirements(str(tmp_path)).requirements[0]
    b = detect_verification_requirements(str(tmp_path)).requirements[0]
    assert a.id == b.id
    assert a.timeout == 600.0
    c = detect_verification_requirements(str(tmp_path), timeout=5).requirements[0]
    assert c.timeout == 5 and c.id == a.id


def test_timeout_kills_whole_process_group(tmp_path):
    svc = CommandExecutor(WorkspaceAccessGuard.from_comma_separated_roots(str(tmp_path)))
    script = "sleep 30 & echo $! > child.pid; sleep 30"
    with pytest.raises(CommandTimedOutError):
        asyncio.run(svc.run_command("t", ["sh", "-c", script], str(tmp_path), timeout=1))
    child = int((tmp_path / "child.pid").read_text())
    end = time.time() + 3
    while is_process_alive(child) and time.time() < end:
        time.sleep(0.05)
    assert not is_process_alive(child), "background child survived the timeout"


def test_extra_env_cannot_inject_secrets(monkeypatch):
    monkeypatch.setenv("MY_API_KEY", "leak")
    env = build_environment_without_secrets(
        {"CI": "1", "GITHUB_TOKEN": "x", "lower": "y", "DB_PASSWORD": "z"}
    )
    assert env["CI"] == "1"
    for bad in ("MY_API_KEY", "GITHUB_TOKEN", "lower", "DB_PASSWORD"):
        assert bad not in env


def test_exec_reports_real_nonzero_exit(tmp_path):
    svc = CommandExecutor(WorkspaceAccessGuard.from_comma_separated_roots(str(tmp_path)))
    res = asyncio.run(
        svc.run_command("t", [sys.executable, "-c", "import sys; sys.exit(4)"], str(tmp_path))
    )
    assert res["exit_code"] == 4
