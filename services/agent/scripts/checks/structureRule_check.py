#!/usr/bin/env python3
from __future__ import annotations

import io
import os
import re
import sys
import tokenize

MAX_FILE_LINES = 350
MAX_FILES_PER_FOLDER = 5
SKIPPED_FOLDERS = {
    "node_modules",
    ".venv",
    "dist",
    "__pycache__",
    ".git",
    ".pytest_cache",
    ".ruff_cache",
    "target",
}
SOURCE_SUFFIXES = (".py", ".ts", ".tsx", ".css", ".js", ".mjs")
PRAGMA_OR_SECURITY = re.compile(r"#!|#\s*(noqa|type:\s*ignore|pragma|Security:)")
PYTHON_FILE_NAME = re.compile(r"^[a-z][a-zA-Z0-9]*_[a-z][a-zA-Z0-9]*\.py$")
PYTHON_SPECIAL_FILES = {"__init__.py", "conftest.py"}


def is_skipped(path: str) -> bool:
    parts = path.split(os.sep)
    return any(p in SKIPPED_FOLDERS for p in parts) or "src-tauri/target" in path


def count_lines(path: str) -> int:
    with open(path, encoding="utf-8", errors="replace") as fh:
        return sum(1 for _ in fh)


def list_python_comment_problems(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    problems = []
    security_note_line = -1
    for tok in tokenize.generate_tokens(io.StringIO(src).readline):
        if tok.type != tokenize.COMMENT:
            continue
        line = tok.start[0]
        if PRAGMA_OR_SECURITY.match(tok.string):
            if "Security:" in tok.string:
                security_note_line = line
            continue
        if line == security_note_line + 1 and tok.line.strip().startswith("#"):
            security_note_line = line
            continue
        problems.append(f"{path}:{line} comment: {tok.string[:70]}")
    return problems


def check_tree(root: str) -> list[str]:
    report = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIPPED_FOLDERS]
        if is_skipped(os.path.relpath(dirpath, root)):
            continue
        counted = [f for f in filenames if f != "__init__.py"]
        if len(counted) > MAX_FILES_PER_FOLDER:
            report.append(f"FOLDER {dirpath} has {len(counted)} files (> {MAX_FILES_PER_FOLDER})")
        for name in filenames:
            path = os.path.join(dirpath, name)
            if not name.endswith(SOURCE_SUFFIXES):
                continue
            lines = count_lines(path)
            if lines > MAX_FILE_LINES:
                report.append(f"FILE {path} has {lines} lines (> {MAX_FILE_LINES})")
            if name.endswith(".py"):
                if name not in PYTHON_SPECIAL_FILES and not PYTHON_FILE_NAME.match(name):
                    report.append(f"NAME {path} is not camelCase_role.py")
                report.extend(list_python_comment_problems(path))
    return report


if __name__ == "__main__":
    roots = sys.argv[1:] or [os.path.dirname(os.path.dirname(os.path.dirname(__file__)))]
    findings = [line for root in roots for line in check_tree(os.path.abspath(root))]
    for line in findings:
        print(line)
    print(f"{len(findings)} rule finding(s)")
    sys.exit(1 if findings else 0)
