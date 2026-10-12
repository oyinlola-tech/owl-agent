from __future__ import annotations

from ..guards.secretScrub_guard import redact_secrets_in_text

DEFAULT_MAX_CHARS = 100_000
HARD_MAX_CHARS = 1_000_000

# Security: documents are read fully into memory and parsed in-process, so a hard byte cap
# stops a hostile or accidental multi-gigabyte file from exhausting memory. It is larger than
# the 1 MiB text-file cap because PDF/DOCX/XLSX containers are legitimately bigger than source.
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

MAX_PDF_PAGES = 200
MAX_SHEET_ROWS = 2000
MAX_SHEET_COLS = 100
MAX_CSV_ROWS = 5000
MAX_CSV_COLS = 200


class DocumentError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


class UnsupportedDocumentError(DocumentError):
    pass


class DocumentParseError(DocumentError):
    pass


class DocumentTooLargeError(DocumentError):
    pass


def clamp_max_chars(value: int | None) -> int:
    if value is None:
        return DEFAULT_MAX_CHARS
    return max(1, min(int(value), HARD_MAX_CHARS))


def finalize_extracted_text(text: str, max_chars: int) -> tuple[str, bool, bool]:
    # Security: every byte of returned document text passes through the secret scrubber so a
    # file that embeds an API key or private key never leaves this service verbatim.
    truncated = False
    if len(text) > max_chars:
        text = text[:max_chars]
        truncated = True
    cleaned, redacted = redact_secrets_in_text(text)
    return cleaned, truncated, redacted


def library_unavailable_result(document_type: str, library: str) -> dict:
    return {
        "type": document_type,
        "text": "",
        "structure": {"kind": document_type, "status": "library_not_installed", "library": library},
        "truncated": False,
    }
