"""Controlled command execution. argv arrays only, never a shell string."""

from __future__ import annotations

import asyncio
import os
import re
import time

from .memory import scrub_secrets
from .workspaces import WorkspaceAuth, WorkspaceError

ALWAYS_REFUSE = re.compile(r"^\s*(sudo|su|doas|runas)\b", re.I)
HIGH_RISK = (
    re.compile(r"\brm\s+.*-[a-z]*r", re.I),
    re.compile(r"\b(mkfs|dd|fdisk|parted)\b", re.I),
    re.compile(r"\b(chmod|chown)\b", re.I),
    re.compile(r"\b(apt|apt-get|dnf|yum|pacman|brew)\b.*\binstall\b", re.I),
    re.compile(r"\b(pip|npm|pnpm|yarn|uv|go|cargo)\b.*\binstall\b", re.I),
    re.compile(r"\b(curl|wget)\b", re.I),
    re.compile(r"\b(systemctl|service)\b", re.I),
    re.compile(r"\b(shutdown|reboot|halt|poweroff)\b", re.I),
)

SECRET_ENV = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)", re.I)


class ExecError(Exception):
    pass


class RefusedError(ExecError):
    pass


def assess(argv: list[str]) -> tuple[str, str]:
    """Returns (verdict, reason): verdict is ok, high, or refused."""
    if not argv or not argv[0].strip():
        return "refused", "empty executable"
    joined = " ".join(argv)
    if ALWAYS_REFUSE.search(argv[0]):
        return "refused", "privilege escalation is out of scope"
    for pattern in HIGH_RISK:
        if pattern.search(joined):
            return "high", f"matches high-risk pattern {pattern.pattern}"
    return "ok", ""


def clean_env() -> dict[str, str]:
    keep = {}
    for key, value in os.environ.items():
        if SECRET_ENV.search(key):
            continue
        keep[key] = value
    keep["TERM"] = "dumb"
    return keep


class ExecService:
    def __init__(
        self, auth: WorkspaceAuth, *, timeout: float = 120.0, output_limit: int = 65536
    ) -> None:
        self.auth = auth
        self.timeout = timeout
        self.output_limit = output_limit
        self._running: dict[str, asyncio.subprocess.Process] = {}

    def running(self) -> list[str]:
        return [k for k, p in self._running.items() if p.returncode is None]

    async def kill_all(self) -> None:
        for proc in list(self._running.values()):
            if proc.returncode is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
        self._running.clear()

    async def run(
        self, task_id: str, argv: list[str], cwd: str = ".", timeout: float | None = None
    ) -> dict:
        if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
            raise ExecError("argv must be a list of strings")
        verdict, reason = assess(argv)
        if verdict == "refused":
            raise RefusedError(reason)
        try:
            workdir = self.auth.resolve(cwd)
        except WorkspaceError as exc:
            raise ExecError(str(exc)) from exc
        if not os.path.isdir(workdir):
            raise ExecError("working directory does not exist")
        limit = timeout if timeout is not None else self.timeout
        key = f"{task_id}:{time.monotonic_ns()}"
        start = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=workdir,
                env=clean_env(),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
        except FileNotFoundError as exc:
            raise ExecError(f"executable not found: {argv[0]}") from exc
        except OSError as exc:
            raise ExecError(f"cannot start process: {exc}") from exc
        self._running[key] = proc
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=limit)
        except TimeoutError as exc:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()
            raise ExecError(f"command timed out after {limit}s") from exc
        finally:
            self._running.pop(key, None)
        duration = int((time.monotonic() - start) * 1000)
        stdout, truncated_out = self._cap(out.decode("utf-8", "replace"))
        stderr, truncated_err = self._cap(err.decode("utf-8", "replace"))
        stdout, _ = scrub_secrets(stdout)
        stderr, _ = scrub_secrets(stderr)
        return {
            "argv": argv,
            "cwd": workdir,
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "truncated": truncated_out or truncated_err,
            "duration_ms": duration,
            "risk": verdict,
            "risk_reason": reason,
        }

    def _cap(self, text: str) -> tuple[str, bool]:
        if len(text) > self.output_limit:
            return text[: self.output_limit] + f"\n…[truncated at {self.output_limit} chars]", True
        return text, False
