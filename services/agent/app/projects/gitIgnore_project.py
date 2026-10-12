from __future__ import annotations

import os

from pathspec import GitIgnoreSpec

ALWAYS_HIDDEN_NAMES = frozenset({".git"})
MAX_IGNORE_FILE_BYTES = 262144


def read_ignore_lines(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read(MAX_IGNORE_FILE_BYTES).splitlines()
    except OSError:
        return []


class GitIgnoreMatcher:
    def __init__(self, project_root: str) -> None:
        self.root = project_root
        self.specs: dict[str, GitIgnoreSpec | None] = {}
        exclude = read_ignore_lines(os.path.join(project_root, ".git", "info", "exclude"))
        self.exclude_spec = GitIgnoreSpec.from_lines(exclude) if exclude else None

    def load_spec_for_folder(self, relative_folder: str) -> GitIgnoreSpec | None:
        if relative_folder not in self.specs:
            ignore_file = os.path.join(self.root, relative_folder, ".gitignore")
            lines = read_ignore_lines(ignore_file) if os.path.isfile(ignore_file) else []
            self.specs[relative_folder] = GitIgnoreSpec.from_lines(lines) if lines else None
        return self.specs[relative_folder]

    def decide_single_path(self, relative_path: str, is_dir: bool) -> bool:
        parts = relative_path.split("/")
        decision = False
        candidates: list[tuple[GitIgnoreSpec | None, str]] = [(self.exclude_spec, relative_path)]
        for depth in range(len(parts)):
            folder = "/".join(parts[:depth])
            remainder = "/".join(parts[depth:])
            candidates.append((self.load_spec_for_folder(folder), remainder))
        for spec, subject in candidates:
            if spec is None:
                continue
            result = spec.check_file(subject + "/" if is_dir else subject)
            if result.include is not None:
                decision = bool(result.include)
        return decision

    def is_ignored(self, relative_path: str, is_dir: bool) -> bool:
        relative_path = relative_path.replace(os.sep, "/").strip("/")
        if not relative_path:
            return False
        parts = relative_path.split("/")
        if any(part in ALWAYS_HIDDEN_NAMES for part in parts):
            return True
        for depth in range(1, len(parts)):
            if self.decide_single_path("/".join(parts[:depth]), True):
                return True
        return self.decide_single_path(relative_path, is_dir)
