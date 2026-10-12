import asyncio
import socket
import sys
import threading

import pytest

from app.executors.commandExecutor_executor import CommandExecutor
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.sandboxes.sandboxPolicy_sandbox import ResourceLimits, SandboxPolicy, build_sandbox_policy
from app.sandboxes.sandboxRunner_sandbox import SandboxRunner
from app.settings.serviceSettings_setting import Settings


def build_bubblewrap_runner(tmp_path, monkeypatch, **limits):
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "id_rsa").write_text("FAKE-PRIVATE-KEY")
    monkeypatch.setenv("HOME", str(home))
    data = tmp_path / "data"
    data.mkdir()
    policy = build_sandbox_policy(Settings(_env_file=None, sandbox_backend="bubblewrap"), str(data))
    if limits:
        policy = SandboxPolicy(**{**policy.__dict__, "limits": ResourceLimits(**limits)})
    runner = SandboxRunner(policy, str(data))
    runner.run_startup_self_test()
    if not runner.is_active:
        pytest.skip(f"bubblewrap sandbox unavailable: {runner.unavailable_reason}")
    return runner, home


def build_sandboxed_executor(tmp_path, monkeypatch, **limits):
    runner, home = build_bubblewrap_runner(tmp_path, monkeypatch, **limits)
    ws = tmp_path / "ws"
    ws.mkdir()
    return CommandExecutor(WorkspaceAccessGuard([str(ws)]), sandbox=runner), ws, home


def run_in_sandbox(executor, argv, **kwargs):
    return asyncio.run(executor.run_command("t1", argv, ".", timeout=60, **kwargs))


def start_host_listener():
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(8)
    threading.Thread(target=lambda: [server.accept() for _ in range(4)], daemon=True).start()
    return server, server.getsockname()[1]


CONNECT_CODE = (
    "import socket, sys\n"
    "try:\n    socket.create_connection(('127.0.0.1', int(sys.argv[1])), timeout=3)\n"
    "    print('CONNECTED')\n"
    "except OSError as exc:\n    print('BLOCKED', exc)\n"
)


def test_workspace_writes_work_and_outside_writes_fail(tmp_path, monkeypatch):
    executor, ws, home = build_sandboxed_executor(tmp_path, monkeypatch)
    outside = tmp_path / "outside.txt"
    script = f"echo inside > made.txt; echo x > {outside}; echo y > {home}/home-file.txt; true"
    res = run_in_sandbox(executor, ["sh", "-c", script])
    assert res["sandboxed"] is True and res["sandbox_backend"] == "bubblewrap"
    assert (ws / "made.txt").read_text().strip() == "inside"
    assert not outside.exists()
    assert not (home / "home-file.txt").exists()


def test_ssh_key_in_home_is_not_readable(tmp_path, monkeypatch):
    executor, _, home = build_sandboxed_executor(tmp_path, monkeypatch)
    res = run_in_sandbox(executor, ["cat", str(home / ".ssh" / "id_rsa")])
    assert res["exit_code"] != 0
    assert "FAKE-PRIVATE-KEY" not in res["stdout"]


def test_network_blocked_by_default_and_allowed_with_flag(tmp_path, monkeypatch):
    executor, _, _ = build_sandboxed_executor(tmp_path, monkeypatch)
    server, port = start_host_listener()
    try:
        blocked = run_in_sandbox(executor, [sys.executable, "-c", CONNECT_CODE, str(port)])
        assert "BLOCKED" in blocked["stdout"] and blocked["network"] is False
        allowed = run_in_sandbox(
            executor, [sys.executable, "-c", CONNECT_CODE, str(port)], network=True
        )
        assert "CONNECTED" in allowed["stdout"] and allowed["network"] is True
    finally:
        server.close()


def test_real_pytest_project_passes_inside_sandbox(tmp_path, monkeypatch):
    executor, ws, _ = build_sandboxed_executor(tmp_path, monkeypatch)
    (ws / "calc.py").write_text("def add(a, b):\n    return a + b\n")
    (ws / "test_calc.py").write_text(
        "from calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n"
    )
    res = run_in_sandbox(executor, [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"])
    assert res["exit_code"] == 0, res["stdout"] + res["stderr"]
    assert "1 passed" in res["stdout"]


def test_fork_bomb_is_bounded_by_process_limit(tmp_path, monkeypatch):
    executor, _, _ = build_sandboxed_executor(
        tmp_path, monkeypatch, max_processes=64, cpu_seconds=60, memory_mb=4096, open_files=256
    )
    code = (
        "import subprocess\nstarted = failed = 0\nprocs = []\n"
        "for _ in range(200):\n"
        "    try:\n        procs.append(subprocess.Popen(['sleep', '2'])); started += 1\n"
        "    except OSError:\n        failed += 1\n"
        "print(started, failed)\n"
    )
    res = run_in_sandbox(executor, [sys.executable, "-c", code])
    started, failed = (int(n) for n in res["stdout"].split())
    assert started <= 64
    assert failed >= 136


def test_git_hooks_run_sandboxed_with_scrubbed_environment(tmp_path, monkeypatch):
    import subprocess

    from app.executors import gitExecutor_executor as git_tools

    executor, ws, _ = build_sandboxed_executor(tmp_path, monkeypatch)
    monkeypatch.setenv("MY_API_KEY", "nvapi-hook-should-not-see")
    subprocess.run(["git", "init", "-q", str(ws)], check=True)
    subprocess.run(["git", "-C", str(ws), "config", "user.email", "t@t"], check=True)
    subprocess.run(["git", "-C", str(ws), "config", "user.name", "t"], check=True)
    escape = tmp_path / "hook-escaped.txt"
    (ws / ".git" / "hooks").mkdir(exist_ok=True)
    hook = ws / ".git" / "hooks" / "pre-commit"
    hook.write_text(
        f'#!/bin/sh\necho "$MY_API_KEY" > {escape}\necho "key=$MY_API_KEY" > seen.txt\n'
    )
    hook.chmod(0o755)
    (ws / "a.txt").write_text("hello")
    result = asyncio.run(git_tools.commit_git_files(executor, ".", ["a.txt"], "add a"))
    assert result["committed"] is True and result["sandboxed"] is True
    assert not escape.exists()
    assert (ws / "seen.txt").read_text().strip() == "key="
