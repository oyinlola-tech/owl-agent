from __future__ import annotations

import os
import re

SENSITIVE_PATH_PATTERNS = (
    re.compile(r"(^|/)\.env(\.|$)"),
    re.compile(r"(^|/)\.ssh(/|$)"),
    re.compile(r"(^|/)\.gnupg(/|$)"),
    re.compile(r"(^|/)(id_rsa|id_ed25519|id_dsa)(\.|$)"),
    re.compile(r"\.(pem|key|p12|pfx|kdbx)$", re.I),
    re.compile(r"(^|/)(Cookies|Login Data|Web Data|places\.sqlite)(^|$)"),
)


class WorkspaceError(Exception):
    pass


class WorkspaceAccessGuard:
    def __init__(self, roots: list[str]) -> None:
        self.roots = [os.path.realpath(os.path.expanduser(r)) for r in roots if r.strip()]

    @classmethod
    def from_comma_separated_roots(cls, value: str) -> WorkspaceAccessGuard:
        return cls([r for r in value.split(",") if r.strip()])

    def list_roots(self) -> list[str]:
        return list(self.roots)

    def resolve_authorized_path(self, path: str, *, allow_sensitive: bool = False) -> str:
        # Security: every filesystem operation resolves through here. The path is
        # canonicalized first, so traversal, symlink escapes, and sensitive files are rejected.
        if not self.roots:
            raise WorkspaceError("no workspaces authorized")
        expanded = os.path.expanduser(path)
        if not os.path.isabs(expanded):
            expanded = os.path.join(self.roots[0], expanded)
        canonical = os.path.realpath(os.path.normpath(expanded))
        if not any(canonical == root or canonical.startswith(root + os.sep) for root in self.roots):
            raise WorkspaceError("path is outside authorized workspaces")
        rel = os.path.relpath(
            canonical,
            next(r for r in self.roots if canonical == r or canonical.startswith(r + os.sep)),
        )
        if not allow_sensitive and self.is_sensitive_path(rel, canonical):
            raise WorkspaceError("sensitive path requires explicit authorization")
        return canonical

    @staticmethod
    def is_sensitive_path(rel: str, canonical: str) -> bool:
        lowered = rel.replace(os.sep, "/")
        if any(p.search("/" + lowered) for p in SENSITIVE_PATH_PATTERNS):
            return True
        return bool(set(lowered.split("/")) & {".ssh", ".gnupg", ".mozilla", ".pki"})
