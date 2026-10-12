from __future__ import annotations

import io

from ..documentResult_document import MAX_PDF_PAGES, library_unavailable_result


def extract_pdf(data: bytes, max_chars: int) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError:
        return library_unavailable_result("pdf", "pypdf")
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        reader.decrypt("")
    pages = reader.pages
    total = len(pages)
    truncated = total > MAX_PDF_PAGES
    chunks: list[str] = []
    extracted = 0
    for page in pages[:MAX_PDF_PAGES]:
        chunks.append(page.extract_text() or "")
        extracted += 1
        if sum(len(chunk) for chunk in chunks) > max_chars:
            truncated = True
            break
    body = "\n\n".join(chunks)
    if len(body) > max_chars:
        body = body[:max_chars]
        truncated = True
    return {
        "type": "pdf",
        "text": body,
        "structure": {"kind": "pdf", "pages": total, "pages_extracted": extracted},
        "truncated": truncated,
    }
