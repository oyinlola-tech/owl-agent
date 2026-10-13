from __future__ import annotations

import logging
import os
import re
from logging.handlers import RotatingFileHandler

from ..guards.secretScrub_guard import redact_secrets_in_text

LOG_FILE_NAME = "owl.log"
LOG_FILE_MAX_BYTES = 2 * 1024 * 1024
LOG_FILE_BACKUP_COUNT = 4
BEARER_PATTERN = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}")
QUERY_TOKEN_PATTERN = re.compile(r"(?i)([?&]token=)[^&\s\"']+")
OWL_LOG_HANDLER_NAME = "owl-rotating-file"


class SecretScrubbingFilter(logging.Filter):
    # Security: log files outlive the process and get attached to bug reports, so every
    # line is scrubbed of API keys, bearer tokens and the service token before it is written.

    def __init__(self, known_secrets: list[str] | None = None) -> None:
        super().__init__()
        self.known_secrets = [s for s in (known_secrets or []) if len(s) >= 8]

    def scrub_text(self, text: str) -> str:
        for secret in self.known_secrets:
            text = text.replace(secret, "[redacted-secret]")
        text = BEARER_PATTERN.sub("Bearer [redacted-secret]", text)
        text = QUERY_TOKEN_PATTERN.sub(r"\1[redacted-secret]", text)
        text, _ = redact_secrets_in_text(text)
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except (TypeError, ValueError):
            message = str(record.msg)
        record.msg = self.scrub_text(message)
        record.args = ()
        return True


class PrivateRotatingFileHandler(RotatingFileHandler):
    def _open(self):  # type: ignore[no-untyped-def]
        stream = super()._open()
        if os.name == "posix":
            try:
                os.chmod(self.baseFilename, 0o600)
            except OSError:
                pass
        return stream


def install_rotating_log_file(logs_dir: str, known_secrets: list[str] | None = None) -> str:
    os.makedirs(logs_dir, mode=0o700, exist_ok=True)
    path = os.path.join(logs_dir, LOG_FILE_NAME)
    root = logging.getLogger()
    for handler in list(root.handlers):
        if handler.get_name() == OWL_LOG_HANDLER_NAME:
            root.removeHandler(handler)
            handler.close()
    handler = PrivateRotatingFileHandler(
        path, maxBytes=LOG_FILE_MAX_BYTES, backupCount=LOG_FILE_BACKUP_COUNT, encoding="utf-8"
    )
    handler.set_name(OWL_LOG_HANDLER_NAME)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    handler.addFilter(SecretScrubbingFilter(known_secrets))
    for existing in root.handlers:
        if (
            isinstance(existing, logging.StreamHandler)
            and existing.get_name() != OWL_LOG_HANDLER_NAME
            and not any(isinstance(item, SecretScrubbingFilter) for item in existing.filters)
        ):
            existing.addFilter(SecretScrubbingFilter(known_secrets))
    root.addHandler(handler)
    return path


def add_known_secret_to_log_filter(secret: str) -> None:
    if len(secret) < 8:
        return
    for handler in logging.getLogger().handlers:
        for item in handler.filters:
            if isinstance(item, SecretScrubbingFilter):
                item.known_secrets.append(secret)
