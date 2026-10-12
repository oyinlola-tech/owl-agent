from __future__ import annotations

import os
import shutil
import socket
import subprocess
import tempfile
from dataclasses import asdict, dataclass

PROBE_SECRET = "owl-sandbox-probe-secret"
PROBE_SCRIPT = (
    'if cat "$1" 2>/dev/null | grep -q owl-sandbox-probe; then echo READ_OUTSIDE=allowed;'
    " else echo READ_OUTSIDE=blocked; fi;"
    ' if (exec 3<>"/dev/tcp/127.0.0.1/$2") 2>/dev/null; then echo NETWORK=allowed;'
    " else echo NETWORK=blocked; fi;"
    " if echo ok > owl-probe.txt 2>/dev/null; then echo WORKSPACE_WRITE=ok;"
    " else echo WORKSPACE_WRITE=failed; fi"
)


@dataclass
class SelfTestResult:
    ran: bool
    passed: bool
    read_outside_blocked: bool = False
    network_blocked: bool = False
    workspace_write_ok: bool = False
    detail: str = ""

    def to_plain_dict(self) -> dict:
        return asdict(self)


def parse_probe_output(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.strip().partition("=")
        if sep:
            found[key] = value
    return found


def run_sandbox_self_test(prepare_launch, probe_folder: str) -> SelfTestResult:
    # Security: proves the sandbox really works by trying to read a file outside the
    # workspace and to reach a socket on the host. Both must fail and the workspace must
    # stay writable, otherwise the backend is treated as unavailable.
    bash = shutil.which("bash")
    if not bash:
        return SelfTestResult(ran=False, passed=False, detail="bash is needed for the self-test")
    os.makedirs(probe_folder, mode=0o700, exist_ok=True)
    workspace = tempfile.mkdtemp(prefix="owl-sandbox-selftest-")
    secret_path = os.path.join(probe_folder, "sandbox-probe.txt")
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with open(secret_path, "w", encoding="utf-8") as fh:
            fh.write(PROBE_SECRET)
        os.chmod(secret_path, 0o600)
        listener.bind(("127.0.0.1", 0))
        listener.listen(4)
        port = listener.getsockname()[1]
        launch = prepare_launch(
            [bash, "-c", PROBE_SCRIPT, "probe", secret_path, str(port)],
            workspace,
            workspace,
            False,
            bash,
        )
        done = subprocess.run(
            launch.argv,
            cwd=workspace,
            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": os.path.expanduser("~")},
            capture_output=True,
            timeout=20,
            check=False,
        )
        found = parse_probe_output(done.stdout.decode("utf-8", "replace"))
        result = SelfTestResult(
            ran=True,
            passed=False,
            read_outside_blocked=found.get("READ_OUTSIDE") == "blocked",
            network_blocked=found.get("NETWORK") == "blocked",
            workspace_write_ok=found.get("WORKSPACE_WRITE") == "ok"
            and os.path.isfile(os.path.join(workspace, "owl-probe.txt")),
        )
        result.passed = (
            result.read_outside_blocked and result.network_blocked and result.workspace_write_ok
        )
        if not result.passed:
            stderr = done.stderr.decode("utf-8", "replace").strip()[:300]
            result.detail = f"exit {done.returncode}: {stderr or done.stdout.decode()[:300]}"
        return result
    except (OSError, subprocess.SubprocessError) as exc:
        return SelfTestResult(ran=True, passed=False, detail=f"{type(exc).__name__}: {exc}"[:300])
    finally:
        listener.close()
        shutil.rmtree(workspace, ignore_errors=True)
        try:
            os.unlink(secret_path)
        except OSError:
            pass
