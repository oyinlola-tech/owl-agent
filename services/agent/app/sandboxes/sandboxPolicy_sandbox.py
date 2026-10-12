from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

SANDBOX_MODES = ("required", "preferred", "off")
CONTAINER_BACKENDS = ("docker", "podman")
SYSTEM_READONLY_PATHS = ("/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32", "/opt")
SYSTEM_ETC_PATHS = (
    "/etc/alternatives",
    "/etc/ssl",
    "/etc/ca-certificates",
    "/etc/pki",
    "/etc/resolv.conf",
    "/etc/hosts",
    "/etc/host.conf",
    "/etc/gai.conf",
    "/etc/nsswitch.conf",
    "/etc/passwd",
    "/etc/group",
    "/etc/localtime",
    "/etc/timezone",
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/ld.so.conf.d",
    "/etc/protocols",
    "/etc/services",
    "/etc/mime.types",
    "/etc/gitconfig",
    "/etc/pip.conf",
    "/etc/npmrc",
    "/etc/java-17-openjdk",
    "/etc/java-21-openjdk",
    "/etc/python3",
)
# Security: credential stores, browser profiles, and keyrings. They are never bound, and are
# masked when they fall inside a bound folder (for example a workspace that is $HOME).
SENSITIVE_HOME_ENTRIES = (
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".kube",
    ".docker",
    ".netrc",
    ".git-credentials",
    ".npmrc",
    ".pypirc",
    ".password-store",
    ".pki",
    ".mozilla",
    ".config/gcloud",
    ".config/gh",
    ".config/google-chrome",
    ".config/chromium",
    ".config/BraveSoftware",
    ".local/share/keyrings",
    ".var/app",
)
ALWAYS_HIDDEN_PATHS = ("/var/run/docker.sock", "/run/docker.sock", "/run/user")
HOME_GIT_CONFIG_PATHS = ("~/.gitconfig", "~/.config/git")
DEFAULT_TOOLCHAIN_PATHS = (
    "~/.cargo/bin",
    "~/.rustup",
    "~/.nvm",
    "~/.volta",
    "~/.pyenv",
    "~/.local/share/uv/python",
    "~/.bun",
    "~/.deno",
    "~/go/pkg/mod",
    "~/.sdkman",
)


class SandboxUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class ResourceLimits:
    max_processes: int = 256
    cpu_seconds: int = 900
    memory_mb: int = 16384
    open_files: int = 4096


@dataclass(frozen=True)
class SandboxPolicy:
    mode: str = "preferred"
    backend: str = "auto"
    image: str = "python:3.12-slim"
    home: str = field(default_factory=lambda: os.path.expanduser("~"))
    home_readonly_paths: tuple[str, ...] = ()
    extra_readonly_paths: tuple[str, ...] = ()
    hidden_paths: tuple[str, ...] = ()
    limits: ResourceLimits = field(default_factory=ResourceLimits)
    verify_network: bool = False


@dataclass
class SandboxLaunch:
    argv: list[str]
    sandboxed: bool
    backend: str
    network: bool
    cleanup_argv: list[str] | None = None
    rlimits: dict[str, int] = field(default_factory=dict)


def split_path_list(value: str) -> tuple[str, ...]:
    return tuple(p.strip() for p in value.split(",") if p.strip())


def resolve_mode_and_backend(mode: str, backend: str) -> tuple[str, str]:
    mode = (mode or "preferred").strip().lower()
    backend = (backend or "auto").strip().lower()
    if mode in CONTAINER_BACKENDS:
        return "required", mode
    if mode not in SANDBOX_MODES:
        # Security: an unknown value must not silently turn the sandbox off.
        mode = "required"
    return mode, backend


def is_sensitive_home_path(path: str, home: str) -> bool:
    real = os.path.realpath(path)
    for entry in SENSITIVE_HOME_ENTRIES:
        hidden = os.path.realpath(os.path.join(home, entry))
        if real == hidden or real.startswith(hidden + os.sep) or hidden.startswith(real + os.sep):
            return True
    return False


def build_sandbox_policy(settings, data_dir: str) -> SandboxPolicy:
    mode, backend = resolve_mode_and_backend(settings.sandbox, settings.sandbox_backend)
    home = os.path.expanduser("~")
    wanted = (
        list(HOME_GIT_CONFIG_PATHS)
        + list(DEFAULT_TOOLCHAIN_PATHS)
        + list(split_path_list(settings.sandbox_cache_paths))
    )
    home_paths: list[str] = []
    for raw in wanted:
        path = os.path.abspath(os.path.expanduser(raw))
        # Security: a configured cache can never expose a credential store or the data dir.
        if is_sensitive_home_path(path, home) or path == home or path in home_paths:
            continue
        if data_dir and os.path.realpath(data_dir).startswith(os.path.realpath(path) + os.sep):
            continue
        home_paths.append(path)
    hidden = [os.path.join(home, entry) for entry in SENSITIVE_HOME_ENTRIES]
    hidden += list(ALWAYS_HIDDEN_PATHS)
    if data_dir:
        hidden.append(os.path.abspath(data_dir))
    return SandboxPolicy(
        mode=mode,
        backend=backend,
        image=settings.sandbox_image,
        home=home,
        home_readonly_paths=tuple(home_paths),
        extra_readonly_paths=split_path_list(settings.sandbox_readonly_paths),
        hidden_paths=tuple(hidden),
        limits=ResourceLimits(
            max_processes=settings.sandbox_max_processes,
            cpu_seconds=settings.sandbox_cpu_seconds,
            memory_mb=settings.sandbox_memory_mb,
            open_files=settings.sandbox_open_files,
        ),
        verify_network=settings.verify_network,
    )


def find_virtualenv_root(path: str) -> str | None:
    current = os.path.dirname(os.path.abspath(path))
    for _ in range(5):
        if os.path.isfile(os.path.join(current, "pyvenv.cfg")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent
    return None


def read_virtualenv_home(venv_root: str) -> str | None:
    try:
        with open(os.path.join(venv_root, "pyvenv.cfg"), encoding="utf-8") as fh:
            for line in fh:
                key, _, value = line.partition("=")
                if key.strip() == "home" and value.strip():
                    return os.path.dirname(os.path.abspath(value.strip()))
    except OSError:
        return None
    return None


def list_toolchain_paths(executable: str | None) -> list[str]:
    paths: list[str] = []
    if not getattr(sys, "frozen", False):
        paths += [sys.prefix, sys.base_prefix]
    if executable and os.path.isabs(executable):
        venv = find_virtualenv_root(executable)
        if venv:
            paths.append(venv)
            home = read_virtualenv_home(venv)
            if home:
                paths.append(home)
    unique: list[str] = []
    for path in paths:
        real = os.path.abspath(path)
        if real not in unique and real != "/":
            unique.append(real)
    return unique


def is_inside(path: str, folder: str) -> bool:
    return path == folder or path.startswith(folder.rstrip(os.sep) + os.sep)
