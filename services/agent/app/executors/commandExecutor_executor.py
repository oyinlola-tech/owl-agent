from __future__ import annotations

import asyncio
import os
import shutil
import signal
import time

from ..guards.commandRisk_guard import assess_command_risk
from ..guards.environmentScrub_guard import build_environment_without_secrets
from ..guards.secretScrub_guard import redact_secrets_in_text
from ..guards.workspaceAccess_guard import WorkspaceAccessGuard, WorkspaceError
from ..sandboxes.sandboxPolicy_sandbox import SandboxLaunch, SandboxUnavailableError, is_inside
from ..sandboxes.sandboxRunner_sandbox import SandboxRunner


class CommandError(Exception):
    pass


class CommandRefusedError(CommandError):
    pass


class CommandTimedOutError(CommandError):
    pass


def kill_process_group(proc: asyncio.subprocess.Process) -> None:
    # Security: the command runs in its own session, so kill it and every child it spawned.
    if proc.returncode is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass


def find_command_executable(name: str, workdir: str, env: dict[str, str]) -> str | None:
    if os.sep in name:
        path = name if os.path.isabs(name) else os.path.join(workdir, name)
        return path if os.path.isfile(path) and os.access(path, os.X_OK) else None
    return shutil.which(name, path=env.get("PATH", os.defpath))


def build_rlimit_setter(rlimits: dict[str, int]):
    import resource

    names = {"cpu": resource.RLIMIT_CPU, "nofile": resource.RLIMIT_NOFILE}

    def apply_rlimits() -> None:
        for name, value in rlimits.items():
            if name in names:
                resource.setrlimit(names[name], (value, value))

    return apply_rlimits


async def remove_leftover_container(launch: SandboxLaunch) -> None:
    if not launch.cleanup_argv:
        return
    try:
        proc = await asyncio.create_subprocess_exec(
            *launch.cleanup_argv,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=20)
    except (OSError, TimeoutError):
        pass


class CommandExecutor:
    # Security: commands run as argv arrays only, never as a shell string.

    def __init__(
        self,
        auth: WorkspaceAccessGuard,
        *,
        timeout: float = 120.0,
        output_limit: int = 65536,
        sandbox: SandboxRunner | None = None,
    ) -> None:
        self.auth = auth
        self.timeout = timeout
        self.output_limit = output_limit
        self.sandbox = sandbox
        self._running: dict[str, asyncio.subprocess.Process] = {}

    def describe_sandbox(self) -> dict:
        active = self.sandbox is not None and self.sandbox.policy.mode != "off"
        active = active and self.sandbox.is_active
        backend = self.sandbox.backend if active and self.sandbox else "none"
        return {"sandboxed": bool(active), "sandbox_backend": backend or "none"}

    def list_running_command_keys(self) -> list[str]:
        return [k for k, p in self._running.items() if p.returncode is None]

    async def kill_commands_for_task(self, task_id: str) -> None:
        # Security: kill only this task's commands; other tasks keep running.
        for key, proc in list(self._running.items()):
            if key.startswith(f"{task_id}:"):
                kill_process_group(proc)
                self._running.pop(key, None)

    async def kill_all_commands(self) -> None:
        for proc in list(self._running.values()):
            kill_process_group(proc)
        self._running.clear()

    async def run_command(
        self,
        task_id: str,
        argv: list[str],
        cwd: str = ".",
        timeout: float | None = None,
        extra_env: dict[str, str] | None = None,
        on_start=None,
        network: bool = False,
    ) -> dict:
        if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
            raise CommandError("argv must be a list of strings")
        verdict, reason = assess_command_risk(argv)
        if verdict == "refused":
            raise CommandRefusedError(reason)
        try:
            workdir = self.auth.resolve_authorized_path(cwd)
        except WorkspaceError as exc:
            raise CommandError(str(exc)) from exc
        if not os.path.isdir(workdir):
            raise CommandError("working directory does not exist")
        limit = timeout if timeout is not None else self.timeout
        env = build_environment_without_secrets(extra_env)
        executable = find_command_executable(argv[0], workdir, env)
        if executable is None:
            raise CommandError(f"executable not found: {argv[0]}")
        launch = self.prepare_sandboxed_launch(argv, workdir, network, executable, env)
        key = f"{task_id}:{time.monotonic_ns()}"
        start = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                *launch.argv,
                cwd=workdir,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
                preexec_fn=build_rlimit_setter(launch.rlimits) if launch.rlimits else None,
            )
        except FileNotFoundError as exc:
            raise CommandError(f"executable not found: {argv[0]}") from exc
        except OSError as exc:
            raise CommandError(f"cannot start process: {exc}") from exc
        self._running[key] = proc
        if on_start is not None:
            on_start(proc.pid)
        try:
            out, err = await asyncio.wait_for(self.read_capped_output(proc), timeout=limit)
        except TimeoutError as exc:
            kill_process_group(proc)
            await proc.wait()
            await remove_leftover_container(launch)
            raise CommandTimedOutError(f"command timed out after {limit}s") from exc
        except asyncio.CancelledError:
            # Security: a cancelled task must never leave the process or its children running.
            kill_process_group(proc)
            await remove_leftover_container(launch)
            raise
        finally:
            self._running.pop(key, None)
        duration = int((time.monotonic() - start) * 1000)
        stdout, truncated_out = self.truncate_output(out.decode("utf-8", "replace"))
        stderr, truncated_err = self.truncate_output(err.decode("utf-8", "replace"))
        truncated_out = truncated_out or len(out) > self.output_limit
        truncated_err = truncated_err or len(err) > self.output_limit
        stdout, _ = redact_secrets_in_text(stdout)
        stderr, _ = redact_secrets_in_text(stderr)
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
            "sandboxed": launch.sandboxed,
            "sandbox_backend": launch.backend,
            "network": launch.network,
        }

    def prepare_sandboxed_launch(
        self, argv: list[str], workdir: str, network: bool, executable: str, env: dict
    ) -> SandboxLaunch:
        if self.sandbox is None:
            return SandboxLaunch(argv=list(argv), sandboxed=False, backend="none", network=True)
        root = next((r for r in self.auth.list_roots() if is_inside(workdir, r)), workdir)
        try:
            return self.sandbox.prepare_launch(
                argv, workdir, root, network=network, executable=executable, env=env
            )
        except SandboxUnavailableError as exc:
            raise CommandRefusedError(str(exc)) from exc

    async def read_capped_output(self, proc: asyncio.subprocess.Process) -> tuple[bytes, bytes]:
        # Security: keep at most output_limit (+1) bytes of each pipe and drain the rest, so a
        # check that prints gigabytes can't exhaust memory or block on a full pipe.
        keep = self.output_limit + 1

        async def drain_stream(stream: asyncio.StreamReader | None) -> bytes:
            buf = bytearray()
            if stream is None:
                return b""
            while True:
                chunk = await stream.read(65536)
                if not chunk:
                    return bytes(buf)
                if len(buf) < keep:
                    buf.extend(chunk[: keep - len(buf)])

        out, err = await asyncio.gather(drain_stream(proc.stdout), drain_stream(proc.stderr))
        await proc.wait()
        return out, err

    def truncate_output(self, text: str) -> tuple[str, bool]:
        if len(text) > self.output_limit:
            return text[: self.output_limit] + f"\n…[truncated at {self.output_limit} chars]", True
        return text, False
