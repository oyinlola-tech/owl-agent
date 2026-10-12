from __future__ import annotations

import os
import re

SECRET_ENV_NAME_PATTERN = re.compile(
    r"(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|(^|_)PAT($|_))",
    re.I,
)
# Security: values like postgres://user:pass@host carry a password whatever the variable is called.
EMBEDDED_CREDENTIAL_PATTERN = re.compile(r"://[^/\s:@]+:[^/\s@]+@")
# Security: callers may add variables (e.g. CI=1), but a name matching
# SECRET_ENV_NAME_PATTERN is still refused.
ALLOWED_EXTRA_ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")


def build_environment_without_secrets(extra: dict[str, str] | None = None) -> dict[str, str]:
    keep = {}
    for key, value in os.environ.items():
        if SECRET_ENV_NAME_PATTERN.search(key) or EMBEDDED_CREDENTIAL_PATTERN.search(value):
            continue
        keep[key] = value
    for key, value in (extra or {}).items():
        if ALLOWED_EXTRA_ENV_NAME.match(key) and not SECRET_ENV_NAME_PATTERN.search(key):
            keep[key] = str(value)
    keep["TERM"] = "dumb"
    return keep
