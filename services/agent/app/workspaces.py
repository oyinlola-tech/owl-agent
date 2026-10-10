"""Workspace authorization. Every filesystem operation resolves through here."""

from __future__ import annotations

import os
import re

SENSITIVE_NAMES = (
    re.compile(r"(^|/)\.env(\.|$)"),
    re.compile(r"(^|/)\.ssh(/|$)"),
    re.compile(r"(^|/)\.gnupg(/|$)"),
    re.compile(r"(^|/)(id_rsa|id_ed25519|id_dsa)(\.|$)"),
    re.compile(r"\.(pem|key|p12|pfx|kdbx)$", re.I),
    re.compile(r"(^|/)(Cookies|Login Data|Web Data|places\.sqlite)(^|$)"),
)


class WorkspaceError(Exception):
    pass


class WorkspaceAuth:
    def __init__(self, roots: list[str]) -> None:
        self.roots = [os.path.realpath(os.path.expanduser(r)) for r in roots if r.strip()]

    @classmethod
    def from_config(cls, value: str) -> WorkspaceAuth:
        return cls([r for r in value.split(",") if r.strip()])

    def list_roots(self) -> list[str]:
        return list(self.roots)

    def resolve(self, path: str, *, allow_sensitive: bool = False) -> str:
        """Canonicalize and authorize. Rejects traversal, escapes, sensitive hits."""
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
        if not allow_sensitive and self.is_sensitive(rel, canonical):
            raise WorkspaceError("sensitive path requires explicit authorization")
        return canonical

    @staticmethod
    def is_sensitive(rel: str, canonical: str) -> bool:
        lowered = rel.replace(os.sep, "/")
        if any(p.search("/" + lowered) for p in SENSITIVE_NAMES):
            return True
        return bool(set(lowered.split("/")) & {".ssh", ".gnupg", ".mozilla", ".pki"})
