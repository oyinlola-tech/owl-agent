from __future__ import annotations

import hashlib
import os
from collections.abc import Callable

from .documentResult_document import (
    MAX_DOCUMENT_BYTES,
    DocumentError,
    DocumentParseError,
    DocumentTooLargeError,
    UnsupportedDocumentError,
    clamp_max_chars,
    finalize_extracted_text,
)
from .extractors.delimitedTable_extractor import extract_csv, extract_tsv
from .extractors.pdfText_extractor import extract_pdf
from .extractors.plainText_extractor import extract_markdown, extract_plain_text
from .extractors.wordDocument_extractor import extract_word_document
from .extractors.workbook_extractor import extract_workbook

Extractor = Callable[[bytes, int], dict]

EXTRACTORS_BY_EXTENSION: dict[str, Extractor] = {
    ".pdf": extract_pdf,
    ".docx": extract_word_document,
    ".xlsx": extract_workbook,
    ".csv": extract_csv,
    ".tsv": extract_tsv,
    ".txt": extract_plain_text,
    ".text": extract_plain_text,
    ".log": extract_plain_text,
    ".md": extract_markdown,
    ".markdown": extract_markdown,
}


def sniff_extractor(data: bytes) -> Extractor | None:
    if data[:5] == b"%PDF-":
        return extract_pdf
    return None


def extract_document(canonical_path: str, *, max_chars: int | None = None) -> dict:
    size = os.path.getsize(canonical_path)
    if size > MAX_DOCUMENT_BYTES:
        raise DocumentTooLargeError("file_too_large", "this document is too large to read")
    extension = os.path.splitext(canonical_path)[1].lower()
    with open(canonical_path, "rb") as handle:
        data = handle.read(MAX_DOCUMENT_BYTES + 1)
    extractor = EXTRACTORS_BY_EXTENSION.get(extension) or sniff_extractor(data)
    if extractor is None:
        raise UnsupportedDocumentError(
            "unsupported_type", f"OWL can't extract text from '{extension or 'this'}' documents yet"
        )
    limit = clamp_max_chars(max_chars)
    try:
        extracted = extractor(data, limit)
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentParseError("parse_failed", f"could not read this document: {exc}") from exc
    text, truncated, redacted = finalize_extracted_text(extracted["text"], limit)
    return {
        "type": extracted["type"],
        "text": text,
        "structure": extracted["structure"],
        "truncated": bool(extracted.get("truncated")) or truncated,
        "redacted": redacted,
        "bytes": size,
        "sha256": hashlib.sha256(data).hexdigest(),
    }
