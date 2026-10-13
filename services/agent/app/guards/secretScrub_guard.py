from __future__ import annotations

import re

SECRET_TEXT_PATTERNS = (
    re.compile(
        r"(?i)\b(api[_-]?key|api[_-]?secret|password|passwd|pwd|secret|token)\b\s*[:=]\s*\S+"
    ),
    re.compile(
        r"\b(nvapi-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9]{8,}"
        r"|rk_live_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}"
        r"|xox[bpas]-[A-Za-z0-9-]{8,}|gsk_[A-Za-z0-9]{8,}|xai-[A-Za-z0-9]{8,}"
        r"|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16})"
    ),
    re.compile(r"(?i)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"),
    re.compile(
        r"(?i)\b(api[_-]?key|api[_-]?secret|secret|token|password|passwd|pwd)\b"
        r"\s+[\"']?[A-Za-z0-9_\-/+=]{32,}[\"']?"
    ),
)


def redact_secrets_in_text(text: str) -> tuple[str, bool]:
    # Security: secrets are never stored or returned; callers get the cleaned text and a flag.
    had = False
    for pattern in SECRET_TEXT_PATTERNS:
        if pattern.search(text):
            had = True
            text = pattern.sub("[redacted-secret]", text)
    return text, had
