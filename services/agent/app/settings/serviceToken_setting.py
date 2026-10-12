from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass

log = logging.getLogger("owl")
TOKEN_FILE_NAME = "service.token"
MINIMUM_TOKEN_LENGTH = 16


@dataclass(frozen=True)
class ServiceTokens:
    primary: str
    source: str
    dev_token: str = ""
    token_file: str = ""

    def list_accepted_tokens(self) -> list[str]:
        return [t for t in (self.primary, self.dev_token) if t]


def write_private_token_file(path: str, token: str) -> None:
    # Security: written 0600 from the start (O_CREAT with mode, then chmod in case the file
    # already existed), so no other local user can read the token.
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(token)
    if os.name == "posix":
        os.chmod(path, 0o600)


def read_token_file(path: str) -> str:
    try:
        with open(os.path.expanduser(path), encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def resolve_service_tokens(settings, data_dir: str) -> ServiceTokens:
    # Security: every request (except GET /health) needs this token, so a website or another
    # local process can't drive the agent. It comes from OWL_SERVICE_TOKEN (set by the
    # desktop shell), from OWL_SERVICE_TOKEN_FILE, or is generated fresh at startup.
    token_file = os.path.join(data_dir, TOKEN_FILE_NAME)
    configured = settings.service_token.strip()
    source = "env"
    if not configured and settings.service_token_file:
        configured = read_token_file(settings.service_token_file)
        source = "file"
    if configured and len(configured) < MINIMUM_TOKEN_LENGTH:
        raise ValueError(f"OWL_SERVICE_TOKEN must be at least {MINIMUM_TOKEN_LENGTH} characters")
    if not configured:
        configured = secrets.token_urlsafe(32)
        source = "generated"
    dev_token = ""
    if source == "generated" and not settings.require_token:
        dev_token = settings.dev_token.strip()
        if dev_token and len(dev_token) < MINIMUM_TOKEN_LENGTH:
            log.warning("OWL_DEV_TOKEN ignored: shorter than %d characters", MINIMUM_TOKEN_LENGTH)
            dev_token = ""
    try:
        write_private_token_file(token_file, configured)
    except OSError as exc:
        log.warning("could not write %s: %s", token_file, type(exc).__name__)
        token_file = ""
    return ServiceTokens(
        primary=configured, source=source, dev_token=dev_token, token_file=token_file
    )
