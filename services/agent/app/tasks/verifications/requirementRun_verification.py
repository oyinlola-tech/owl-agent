from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
import time

from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...executors.commandExecutor_executor import CommandError, CommandTimedOutError


class RequirementRunMixin:
    async def run_single_requirement(self, task_id: str, req, attempt: int, env: dict) -> str:
        # Security: run one requirement through the normal executor and persist exactly what ran.
        run_id = create_prefixed_id("vrun")
        cwd = self.resolve_requirement_directory(task_id, req.cwd)
        started = current_utc_time().isoformat()
        self.conn.execute(
            "INSERT INTO verification_runs (id, task_id, requirement_id, kind, command_json,"
            " working_directory, status, required, source, source_detail, attempt, started_at,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                task_id,
                req.id,
                req.kind,
                json.dumps(list(req.argv)),
                cwd,
                1 if req.required else 0,
                req.source,
                req.detail,
                attempt,
                started,
                started,
            ),
        )
        self.conn.commit()
        await self.save_checkpoint(task_id, f"verification-requirement-started:{req.kind}")
        await self.bus.publish_event(
            task_id,
            "verification.requirement.started",
            {"id": run_id, "requirement_id": req.id, "kind": req.kind, "command": req.label},
        )
        exit_code: int | None = None
        stdout = stderr = error = ""
        sandbox = getattr(self.command_executor, "sandbox", None)
        # Security: verification runs never get network unless OWL_VERIFY_NETWORK=1.
        network = bool(sandbox is not None and sandbox.policy.verify_network)
        clock = time.monotonic()
        # Security: Python's bytecode cache trusts mtime (whole seconds) + size, so a same-size
        # edit made within a second runs the OLD code and can fake a pass. Every run gets an
        # empty, private cache directory so it always executes the current files.
        cache_dir = tempfile.mkdtemp(prefix="owl-verify-pycache-")
        env = {**env, "PYTHONPYCACHEPREFIX": cache_dir, "PYTHONDONTWRITEBYTECODE": "1"}
        try:
            res = await self.command_executor.run_command(
                task_id,
                list(req.argv),
                cwd,
                req.timeout,
                env,
                on_start=lambda pid: self.save_verification_run_pid(run_id, pid),
                network=network,
            )
            await self.record_run_sandbox(task_id, run_id, res)
            if res["argv"] != list(req.argv) or res["cwd"] != cwd:
                # Security: defence in depth, the record must describe the command that ran.
                status, error = "error", "executed command did not match the requirement"
            else:
                exit_code = int(res["exit_code"]) if res["exit_code"] is not None else None
                status = "passed" if exit_code == 0 else "failed"
            stdout, stderr = res.get("stdout", ""), res.get("stderr", "")
        except CommandTimedOutError as exc:
            status, error = "timeout", str(exc)
        except CommandError as exc:
            missing = str(exc).startswith("executable not found")
            status, error = ("unavailable" if missing else "error"), str(exc)
        except asyncio.CancelledError:
            self.close_verification_run(run_id, "cancelled", None, "", "", "task cancelled", clock)
            raise
        finally:
            shutil.rmtree(cache_dir, ignore_errors=True)
        self.close_verification_run(run_id, status, exit_code, stdout, stderr, error, clock)
        await self.save_checkpoint(task_id, f"verification-requirement-completed:{req.kind}")
        await self.bus.publish_event(
            task_id,
            "verification.requirement.completed",
            {
                "id": run_id,
                "requirement_id": req.id,
                "kind": req.kind,
                "command": req.label,
                "status": status,
                "exit_code": exit_code,
                "duration_ms": int((time.monotonic() - clock) * 1000),
            },
        )
        return status

    async def record_run_sandbox(self, task_id: str, run_id: str, res: dict) -> None:
        sandboxed = bool(res.get("sandboxed"))
        self.conn.execute(
            "UPDATE verification_runs SET sandboxed = ?, sandbox_backend = ? WHERE id = ?",
            (1 if sandboxed else 0, str(res.get("sandbox_backend", "none")), run_id),
        )
        self.conn.commit()
        if not sandboxed:
            await self.bus.publish_event(
                task_id,
                "security.unsandboxed",
                {"verification_run": run_id, "command": " ".join(res.get("argv", []))[:200]},
            )

    def save_verification_run_pid(self, run_id: str, pid: int) -> None:
        self.conn.execute("UPDATE verification_runs SET pid = ? WHERE id = ?", (pid, run_id))
        self.conn.commit()

    def close_verification_run(
        self,
        run_id: str,
        status: str,
        exit_code: int | None,
        stdout: str,
        stderr: str,
        error: str,
        clock: float,
    ) -> None:
        self.conn.execute(
            "UPDATE verification_runs SET status = ?, exit_code = ?, stdout = ?, stderr = ?,"
            " error = ?, completed_at = ?, duration_ms = ? WHERE id = ?",
            (
                status,
                exit_code,
                stdout,
                stderr,
                error[:1000],
                current_utc_time().isoformat(),
                int((time.monotonic() - clock) * 1000),
                run_id,
            ),
        )
        self.conn.commit()
