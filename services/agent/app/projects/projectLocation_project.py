from __future__ import annotations

import json
import os
import sys
import tempfile

from ..guards.workspaceAccess_guard import WorkspaceAccessGuard
from ..requirements.requirementDetection_requirement import detect_verification_requirements

POSIX_SYSTEM_FOLDERS = (
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib32",
    "/lib64",
    "/libx32",
    "/proc",
    "/run",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
    "/snap",
    "/System",
    "/Library",
    "/Applications",
    "/private/etc",
    "/private/var",
)
HOME_SENSITIVE_FOLDERS = (
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".kube",
    ".docker",
    ".config",
    ".password-store",
    ".mozilla",
    ".pki",
    ".local/share/keyrings",
    "Library/Keychains",
    "AppData",
)
LANGUAGE_MARKERS = (
    ("package.json", "javascript"),
    ("tsconfig.json", "typescript"),
    ("pyproject.toml", "python"),
    ("requirements.txt", "python"),
    ("setup.py", "python"),
    ("go.mod", "go"),
    ("Cargo.toml", "rust"),
    ("pom.xml", "java"),
    ("build.gradle", "java"),
    ("build.gradle.kts", "kotlin"),
    ("CMakeLists.txt", "c++"),
    ("composer.json", "php"),
    ("Gemfile", "ruby"),
    ("mix.exs", "elixir"),
    ("pubspec.yaml", "dart"),
    ("Package.swift", "swift"),
)
PACKAGE_MANAGER_MARKERS = (
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("bun.lockb", "bun"),
    ("bun.lock", "bun"),
    ("package-lock.json", "npm"),
    ("uv.lock", "uv"),
    ("poetry.lock", "poetry"),
    ("Pipfile.lock", "pipenv"),
    ("Cargo.lock", "cargo"),
    ("go.sum", "go"),
)
NODE_FRAMEWORKS = (
    "next",
    "react",
    "vue",
    "svelte",
    "vite",
    "express",
    "@nestjs/core",
    "electron",
    "@tauri-apps/api",
)
PYTHON_FRAMEWORKS = ("fastapi", "django", "flask")


class ProjectError(Exception):
    def __init__(self, status: int, code: str, detail: str, **extra: object) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.extra = extra


def is_same_or_inside(path: str, folder: str) -> bool:
    return path == folder or path.startswith(folder.rstrip(os.sep) + os.sep)


def list_windows_system_folders() -> list[str]:
    names = ("SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData")
    return [os.path.realpath(os.environ[n]) for n in names if os.environ.get(n)]


def explain_protected_location(canonical: str, data_root: str) -> str:
    home = os.path.realpath(os.path.expanduser("~"))
    temp_root = os.path.realpath(tempfile.gettempdir())
    if canonical == os.path.realpath(os.sep) or os.path.dirname(canonical) == canonical:
        return "the top of the disk can't be a project"
    if is_same_or_inside(home, canonical):
        return "your home folder (or a folder that contains it) can't be a project"
    if os.path.dirname(canonical) == os.path.realpath(os.sep):
        return "top-level system folders can't be a project"
    if data_root and (
        is_same_or_inside(canonical, os.path.realpath(data_root))
        or is_same_or_inside(os.path.realpath(data_root), canonical)
    ):
        return "OWL's own data folder can't be a project"
    for name in HOME_SENSITIVE_FOLDERS:
        if is_same_or_inside(canonical, os.path.join(home, name)):
            return f"~/{name} holds credentials or settings and can't be a project"
    if not is_same_or_inside(canonical, temp_root):
        system_folders = list(POSIX_SYSTEM_FOLDERS)
        if sys.platform == "win32":
            system_folders = list_windows_system_folders()
        for folder in system_folders:
            if is_same_or_inside(canonical, os.path.realpath(folder)):
                return f"{folder} is a system folder and can't be a project"
    relative = os.path.relpath(canonical, home) if is_same_or_inside(canonical, home) else ""
    if relative and WorkspaceAccessGuard.is_sensitive_path(relative, canonical):
        return "this folder holds credentials and can't be a project"
    return ""


def validate_project_folder(path: str, data_root: str) -> str:
    # Security: adding a project grants OWL (and every command it runs) access to the
    # folder, so the home folder, the disk root, system folders and credential folders are
    # refused outright, after resolving symlinks.
    if not isinstance(path, str) or not path.strip() or "\x00" in path:
        raise ProjectError(422, "invalid_path", "choose a folder")
    expanded = os.path.expanduser(path.strip())
    if not os.path.isabs(expanded):
        raise ProjectError(422, "invalid_path", "the folder path must be absolute")
    canonical = os.path.realpath(expanded)
    if not os.path.exists(canonical):
        raise ProjectError(404, "folder_not_found", "that folder doesn't exist")
    if not os.path.isdir(canonical):
        raise ProjectError(422, "not_a_directory", "that path is a file, not a folder")
    reason = explain_protected_location(canonical, data_root)
    if reason:
        raise ProjectError(403, "protected_location", reason)
    if not os.access(canonical, os.R_OK | os.X_OK):
        raise ProjectError(403, "folder_not_readable", "OWL can't read that folder")
    return canonical


def read_text_quietly(path: str, limit: int = 262144) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read(limit)
    except OSError:
        return ""


def detect_frameworks(folder: str) -> list[str]:
    found: list[str] = []
    package = read_text_quietly(os.path.join(folder, "package.json"))
    if package:
        try:
            data = json.loads(package)
        except ValueError:
            data = {}
        deps: dict = {}
        for key in ("dependencies", "devDependencies"):
            if isinstance(data, dict) and isinstance(data.get(key), dict):
                deps.update(data[key])
        found += [name for name in NODE_FRAMEWORKS if name in deps]
    python_text = (
        read_text_quietly(os.path.join(folder, "pyproject.toml"))
        + read_text_quietly(os.path.join(folder, "requirements.txt"))
    ).lower()
    found += [name for name in PYTHON_FRAMEWORKS if name in python_text]
    return found


def detect_project_stack(folder: str) -> dict:
    languages: list[str] = []
    for marker, language in LANGUAGE_MARKERS:
        if os.path.isfile(os.path.join(folder, marker)) and language not in languages:
            languages.append(language)
    managers = [
        manager
        for marker, manager in PACKAGE_MANAGER_MARKERS
        if os.path.isfile(os.path.join(folder, marker))
    ]
    detection = detect_verification_requirements(folder)
    checks = [
        {
            "kind": r.kind,
            "command": r.label,
            "required": r.required,
            "safe": r.safe,
            "unsafe_reason": r.unsafe_reason,
            "source": r.source,
            "runs": r.runs,
        }
        for r in detection.requirements
    ]
    return {
        "languages": languages,
        "frameworks": detect_frameworks(folder),
        "package_manager": managers[0] if managers else "",
        "checks": checks,
        "checks_note": detection.reason,
        "is_git_repository": os.path.exists(os.path.join(folder, ".git")),
    }
