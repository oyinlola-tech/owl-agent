from __future__ import annotations

import asyncio
import codecs
import json
import os
import shlex
import sqlite3
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

from ..databases.recordStamp_database import create_prefixed_id
from ..executors.commandExecutor_executor import (
    CommandExecutor,
    CommandRefusedError,
    build_rlimit_setter,
    find_command_executable,
    kill_process_group,
    remove_leftover_container,
)
from ..guards.commandRisk_guard import assess_command_risk, command_needs_network
from ..guards.environmentScrub_guard import build_environment_without_secrets
from ..guards.secretScrub_guard import redact_secrets_in_text
from ..sandboxes.sandboxPolicy_sandbox import SandboxLaunch
from .projectFile_project import resolve_project_path, to_project_relative
from .projectLocation_project import ProjectError
from .projectStore_project import finish_command_row, insert_command_row

MAX_COMMAND_LENGTH = 2000
SHELL_ONLY_TOKENS = frozenset({"|", "||", "&&", "&", ";", ">", ">>", "<", "<<", "2>", "2>&1", "&>"})
USER_COMMAND_ENVIRONMENT = {"TERM": "dumb", "NO_COLOR": "1"}


@dataclass
class PreparedUserCommand:
    run_id: str
    project_id: str
    command: str
    argv: list[str]
    workdir: str
    cwd: str
    risk: str
    risk_reason: str
    network: bool
    env: dict[str, str]
    launch: SandboxLaunch


def format_sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def parse_user_command(command: str) -> list[str]:
    text = (command or "").strip()
    if not text or len(text) > MAX_COMMAND_LENGTH:
        raise ProjectError(422, "invalid_command", "type a command (up to 2000 characters)")
    try:
        argv = shlex.split(text, posix=True)
    except ValueError as exc:
        raise ProjectError(422, "invalid_command", f"couldn't read the command: {exc}") from exc
    if not argv:
        raise ProjectError(422, "invalid_command", "type a command")
    if any(token in SHELL_ONLY_TOKENS for token in argv):
        raise ProjectError(
            422,
            "shell_syntax_unsupported",
            "commands run without a shell, so pipes, redirects and && aren't supported",
        )
    return argv


def prepare_user_command(
    conn: sqlite3.Connection,
    executor: CommandExecutor,
    project: dict,
    command: str,
    cwd: str = "",
    confirm_high_risk: bool = False,
    allow_network: bool = False,
) -> PreparedUserCommand:
    argv = parse_user_command(command)
    workdir = resolve_project_path(executor.auth, project["path"], cwd)
    if not os.path.isdir(workdir):
        raise ProjectError(422, "not_a_directory", "the working folder doesn't exist")
    risk, reason = assess_command_risk(argv)
    record = {
        "run_id": create_prefixed_id("cmd"),
        "project_id": project["id"],
        "command": command.strip(),
        "argv": argv,
        "cwd": to_project_relative(project["path"], workdir),
        "risk": risk,
        "risk_reason": reason,
    }
    # Security: the user's terminal gets exactly the agent's rules: refused commands (sudo
    # and friends) never run, high-risk ones need an explicit confirmation from the UI, and
    # network access is only granted when the command needs it and the user allowed it.
    if risk == "refused":
        insert_command_row(conn, record, "refused", reason)
        raise ProjectError(403, "command_refused", f"OWL won't run this: {reason}", risk=risk)
    if risk == "high" and not confirm_high_risk:
        raise ProjectError(
            409, "confirmation_required", "this command is high-risk", risk=risk, reason=reason
        )
    network = command_needs_network(argv)
    if network and not allow_network:
        raise ProjectError(
            409,
            "network_confirmation_required",
            "this command needs network access",
            risk=risk,
            reason="needs network access",
        )
    env = build_environment_without_secrets(USER_COMMAND_ENVIRONMENT)
    executable = find_command_executable(argv[0], workdir, env)
    if executable is None:
        raise ProjectError(422, "executable_not_found", f"{argv[0]} isn't installed")
    try:
        launch = executor.prepare_sandboxed_launch(argv, workdir, network, executable, env)
    except CommandRefusedError as exc:
        insert_command_row(conn, record, "refused", str(exc))
        raise ProjectError(403, "sandbox_unavailable", str(exc)) from exc
    return PreparedUserCommand(
        run_id=record["run_id"],
        project_id=project["id"],
        command=record["command"],
        argv=argv,
        workdir=workdir,
        cwd=record["cwd"],
        risk=risk,
        risk_reason=reason,
        network=launch.network,
        env=env,
        launch=launch,
    )


async def pump_stream_lines(
    stream: asyncio.StreamReader | None, name: str, queue: asyncio.Queue
) -> None:
    decoder = codecs.getincrementaldecoder("utf-8")("replace")
    pending = ""
    if stream is not None:
        while chunk := await stream.read(4096):
            pending += decoder.decode(chunk)
            cut = pending.rfind("\n") + 1
            if cut == 0 and len(pending) >= 4096:
                cut = len(pending)
            if cut:
                await queue.put((name, pending[:cut]))
                pending = pending[cut:]
        pending += decoder.decode(b"", final=True)
    if pending:
        await queue.put((name, pending))
    await queue.put((name, None))


class OutputCapture:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.kept = {"stdout": "", "stderr": ""}
        self.truncated = False

    def accept(self, name: str, text: str) -> str:
        room = self.limit - len(self.kept[name])
        if room <= 0:
            self.truncated = True
            return ""
        if len(text) > room:
            self.truncated = True
            text = text[:room]
        self.kept[name] += text
        return text


async def stream_user_command(
    conn: sqlite3.Connection, executor: CommandExecutor, prepared: PreparedUserCommand
) -> AsyncIterator[str]:
    launch = prepared.launch
    record = {
        "run_id": prepared.run_id,
        "project_id": prepared.project_id,
        "command": prepared.command,
        "argv": prepared.argv,
        "cwd": prepared.cwd,
        "risk": prepared.risk,
        "risk_reason": prepared.risk_reason,
        "sandboxed": int(launch.sandboxed),
        "sandbox_backend": launch.backend,
        "network": launch.network,
    }
    insert_command_row(conn, record, "running", "")
    yield format_sse_event(
        "command.started",
        {
            "run_id": prepared.run_id,
            "argv": prepared.argv,
            "cwd": prepared.cwd,
            "risk": prepared.risk,
            "risk_reason": prepared.risk_reason,
            "sandboxed": launch.sandboxed,
            "sandbox_backend": launch.backend,
            "network": launch.network,
            "interactive": False,
        },
    )
    start = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *launch.argv,
            cwd=prepared.workdir,
            env=prepared.env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
            preexec_fn=build_rlimit_setter(launch.rlimits) if launch.rlimits else None,
        )
    except OSError as exc:
        finish_command_row(conn, prepared.run_id, status="error", error=str(exc.strerror or exc))
        yield format_sse_event(
            "command.error",
            {"run_id": prepared.run_id, "code": "start_failed", "detail": "couldn't start it"},
        )
        return
    key = f"user-command:{prepared.run_id}"
    executor._running[key] = proc
    queue: asyncio.Queue = asyncio.Queue()
    pumps = [
        asyncio.create_task(pump_stream_lines(proc.stdout, "stdout", queue)),
        asyncio.create_task(pump_stream_lines(proc.stderr, "stderr", queue)),
    ]
    capture = OutputCapture(executor.output_limit)
    deadline = time.monotonic() + executor.timeout
    status = "cancelled"
    try:
        finished = 0
        while finished < 2:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError
            name, text = await asyncio.wait_for(queue.get(), remaining)
            if text is None:
                finished += 1
                continue
            text, _ = redact_secrets_in_text(text)
            shown = capture.accept(name, text)
            if shown:
                yield format_sse_event(
                    "command.output", {"run_id": prepared.run_id, "stream": name, "text": shown}
                )
        exit_code = await proc.wait()
        status = "completed" if exit_code == 0 else "failed"
        duration = int((time.monotonic() - start) * 1000)
        finish_command_row(
            conn,
            prepared.run_id,
            status=status,
            exit_code=exit_code,
            stdout=capture.kept["stdout"],
            stderr=capture.kept["stderr"],
            truncated=int(capture.truncated),
            duration_ms=duration,
        )
        yield format_sse_event(
            "command.completed",
            {
                "run_id": prepared.run_id,
                "status": status,
                "exit_code": exit_code,
                "duration_ms": duration,
                "truncated": capture.truncated,
            },
        )
    except TimeoutError:
        status = "timed_out"
        kill_process_group(proc)
        await proc.wait()
        await remove_leftover_container(launch)
        finish_command_row(
            conn,
            prepared.run_id,
            status=status,
            stdout=capture.kept["stdout"],
            stderr=capture.kept["stderr"],
            truncated=int(capture.truncated),
            duration_ms=int((time.monotonic() - start) * 1000),
            error=f"timed out after {executor.timeout:g}s",
        )
        yield format_sse_event(
            "command.error",
            {
                "run_id": prepared.run_id,
                "code": "timed_out",
                "detail": f"stopped after {executor.timeout:g}s",
            },
        )
    finally:
        for pump in pumps:
            pump.cancel()
        executor._running.pop(key, None)
        if proc.returncode is None:
            # Security: a closed terminal or dropped connection must never leave the command
            # or its children running.
            kill_process_group(proc)
            asyncio.ensure_future(remove_leftover_container(launch))
        if status == "cancelled":
            finish_command_row(
                conn,
                prepared.run_id,
                status="cancelled",
                stdout=capture.kept["stdout"],
                stderr=capture.kept["stderr"],
                duration_ms=int((time.monotonic() - start) * 1000),
            )
