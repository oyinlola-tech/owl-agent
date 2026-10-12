from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
from pathlib import Path

PACKAGING_DIR = Path(__file__).resolve().parent
SERVICE_DIR = PACKAGING_DIR.parent
REPO_ROOT = SERVICE_DIR.parent.parent
LAUNCHER_FILE = PACKAGING_DIR / "serviceLauncher_packaging.py"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
BUILD_WORK_DIR = PACKAGING_DIR / "build"
SIDECAR_BASE_NAME = "owl-service"
MODULES_NOT_NEEDED_IN_BINARY = (
    "playwright",
    "pytest",
    "_pytest",
    "mypy",
    "ruff",
    "tkinter",
    "IPython",
)
TARGET_TRIPLES_BY_PLATFORM = {
    ("Linux", "x86_64"): "x86_64-unknown-linux-gnu",
    ("Linux", "aarch64"): "aarch64-unknown-linux-gnu",
    ("Darwin", "x86_64"): "x86_64-apple-darwin",
    ("Darwin", "arm64"): "aarch64-apple-darwin",
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
    ("Windows", "ARM64"): "aarch64-pc-windows-msvc",
}


def read_target_triple_from_rustc() -> str:
    rustc = shutil.which("rustc")
    if not rustc:
        return ""
    try:
        output = subprocess.run(
            [rustc, "-vV"], capture_output=True, text=True, check=True, timeout=30
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    for line in output.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    return ""


def guess_target_triple_from_platform() -> str:
    key = (platform.system(), platform.machine())
    if key not in TARGET_TRIPLES_BY_PLATFORM:
        raise SystemExit(f"Unknown platform {key}; pass --target <rust target triple>")
    return TARGET_TRIPLES_BY_PLATFORM[key]


def read_build_options() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the OWL service sidecar binary")
    parser.add_argument("--target", default="", help="Rust target triple for the file name")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT_DIR), help="Output directory")
    return parser.parse_args()


def build_pyinstaller_arguments(binary_name: str, output_dir: Path) -> list[str]:
    arguments = [
        str(LAUNCHER_FILE),
        "--onefile",
        "--noconfirm",
        "--clean",
        "--name",
        binary_name,
        "--distpath",
        str(output_dir),
        "--workpath",
        str(BUILD_WORK_DIR / "work"),
        "--specpath",
        str(BUILD_WORK_DIR),
        "--paths",
        str(SERVICE_DIR),
        "--collect-submodules",
        "app",
        "--collect-submodules",
        "uvicorn",
        "--collect-submodules",
        "keyring",
        "--copy-metadata",
        "keyring",
    ]
    for module_name in MODULES_NOT_NEEDED_IN_BINARY:
        arguments += ["--exclude-module", module_name]
    return arguments


def build_service_binary() -> Path:
    options = read_build_options()
    target = (
        options.target or read_target_triple_from_rustc() or guess_target_triple_from_platform()
    )
    binary_name = f"{SIDECAR_BASE_NAME}-{target}"
    output_dir = Path(options.out).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    import PyInstaller.__main__

    PyInstaller.__main__.run(build_pyinstaller_arguments(binary_name, output_dir))
    suffix = ".exe" if sys.platform == "win32" else ""
    built = output_dir / f"{binary_name}{suffix}"
    if not built.is_file():
        raise SystemExit(f"PyInstaller finished but {built} is missing")
    print(f"Built {built}")
    return built


if __name__ == "__main__":
    build_service_binary()
