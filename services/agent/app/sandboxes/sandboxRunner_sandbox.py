from __future__ import annotations

import logging
import platform
import tempfile

from .backends.bubblewrapBackend_sandbox import build_bubblewrap_launch, find_bubblewrap_binary
from .backends.containerBackend_sandbox import build_container_launch, find_container_binary
from .backends.seatbeltBackend_sandbox import build_seatbelt_launch, find_seatbelt_binary
from .sandboxPolicy_sandbox import (
    CONTAINER_BACKENDS,
    SandboxLaunch,
    SandboxPolicy,
    SandboxUnavailableError,
)
from .sandboxSelfTest_sandbox import SelfTestResult, run_sandbox_self_test

log = logging.getLogger("owl")
SELF_TEST_CACHE: dict[tuple, SelfTestResult] = {}
UNSANDBOXED_NOTE = "runs WITHOUT a sandbox on this system"


def detect_sandbox_backend(policy: SandboxPolicy) -> tuple[str | None, str]:
    if policy.mode == "off":
        return None, "sandbox turned off with OWL_SANDBOX=off"
    wanted = policy.backend
    if wanted in CONTAINER_BACKENDS:
        found = find_container_binary(wanted)
        return (wanted, "") if found else (None, f"{wanted} is not installed")
    system = platform.system()
    if wanted in ("auto", "bubblewrap", "bwrap") and system == "Linux":
        if find_bubblewrap_binary():
            return "bubblewrap", ""
        return None, "bubblewrap (bwrap) is not installed"
    if wanted in ("auto", "sandbox-exec", "seatbelt") and system == "Darwin":
        if find_seatbelt_binary():
            return "sandbox-exec", ""
        return None, "sandbox-exec is not available"
    if system == "Windows":
        return None, "Windows has no supported OS sandbox; commands run unsandboxed"
    return None, f"no sandbox backend '{wanted}' for {system}"


class SandboxRunner:
    # Security: the single sandbox layer every OWL command goes through (agent commands,
    # verification runs, and git tools).

    def __init__(self, policy: SandboxPolicy, probe_folder: str = "") -> None:
        self.policy = policy
        self.probe_folder = probe_folder or tempfile.gettempdir()
        self.backend, self.unavailable_reason = detect_sandbox_backend(policy)
        self.self_test = SelfTestResult(ran=False, passed=False, detail=self.unavailable_reason)

    @property
    def is_active(self) -> bool:
        return self.backend is not None and self.self_test.passed

    def run_startup_self_test(self) -> SelfTestResult:
        if self.backend is None:
            return self.self_test
        key = (self.backend, self.policy)
        if key not in SELF_TEST_CACHE:
            SELF_TEST_CACHE[key] = run_sandbox_self_test(
                lambda argv, wd, root, net, exe: self.build_backend_launch(
                    argv, wd, root, net, exe, {}
                ),
                self.probe_folder,
            )
        self.self_test = SELF_TEST_CACHE[key]
        if not self.self_test.passed:
            self.unavailable_reason = f"{self.backend} self-test failed: {self.self_test.detail}"
            log.warning("sandbox %s", self.unavailable_reason)
        return self.self_test

    def build_backend_launch(
        self,
        argv: list[str],
        workdir: str,
        workspace_root: str,
        network: bool,
        executable: str | None,
        env: dict[str, str],
    ) -> SandboxLaunch:
        if self.backend == "bubblewrap":
            return build_bubblewrap_launch(
                self.policy, argv, workdir, workspace_root, network, executable
            )
        if self.backend == "sandbox-exec":
            return build_seatbelt_launch(
                self.policy, argv, workspace_root, network, executable, tempfile.gettempdir()
            )
        if self.backend in CONTAINER_BACKENDS:
            return build_container_launch(
                self.policy, self.backend, argv, workdir, workspace_root, network, env
            )
        raise SandboxUnavailableError(self.unavailable_reason or "no sandbox backend")

    def prepare_launch(
        self,
        argv: list[str],
        workdir: str,
        workspace_root: str,
        *,
        network: bool = False,
        executable: str | None = None,
        env: dict[str, str] | None = None,
    ) -> SandboxLaunch:
        if self.policy.mode == "off":
            return SandboxLaunch(argv=list(argv), sandboxed=False, backend="none", network=True)
        if not self.is_active:
            if self.policy.mode == "required":
                raise SandboxUnavailableError(
                    "OWL_SANDBOX=required but no working sandbox: "
                    + (self.unavailable_reason or "unknown reason")
                )
            return SandboxLaunch(argv=list(argv), sandboxed=False, backend="none", network=True)
        return self.build_backend_launch(
            argv, workdir, workspace_root, network, executable, env or {}
        )

    def describe_approval_note(self) -> str:
        if self.policy.mode != "off" and self.is_active:
            return ""
        return UNSANDBOXED_NOTE

    def describe_status(self) -> dict:
        limits = self.policy.limits
        return {
            "mode": self.policy.mode,
            "backend": self.backend or "none",
            "active": self.is_active,
            "reason": "" if self.is_active else self.unavailable_reason,
            "self_test": self.self_test.to_plain_dict(),
            "network_policy": {
                "default": "blocked" if self.is_active else "not enforced (no sandbox)",
                "commands": "only with an approval that says 'with network access'",
                "verification": "allowed (OWL_VERIFY_NETWORK=1)"
                if self.policy.verify_network
                else "blocked",
            },
            "limits": {
                "max_processes": limits.max_processes,
                "cpu_seconds": limits.cpu_seconds,
                "memory_mb": limits.memory_mb,
                "open_files": limits.open_files,
            },
            "protected": [
                "writes outside the task workspace",
                "home folder (only allowed toolchain caches, read-only)",
                "~/.ssh, ~/.gnupg, ~/.aws, browser profiles, keyrings",
                "the OWL data folder",
                "the docker socket",
                "network access unless approved",
            ]
            if self.is_active
            else [],
        }
