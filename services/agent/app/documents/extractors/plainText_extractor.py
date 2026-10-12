from __future__ import annotations

TEXT_ENCODINGS = ("utf-8-sig", "utf-8", "utf-16", "latin-1")


def decode_text_bytes(data: bytes) -> tuple[str, str]:
    for encoding in TEXT_ENCODINGS:
        try:
            return data.decode(encoding), encoding
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", "replace"), "utf-8-replace"


def extract_plain_text(data: bytes, max_chars: int, document_type: str = "text") -> dict:
    text, encoding = decode_text_bytes(data)
    truncated = len(text) > max_chars
    body = text[:max_chars]
    return {
        "type": document_type,
        "text": body,
        "structure": {
            "kind": "text",
            "encoding": encoding,
            "lines": body.count("\n") + 1 if body else 0,
        },
        "truncated": truncated,
    }


def extract_markdown(data: bytes, max_chars: int) -> dict:
    return extract_plain_text(data, max_chars, document_type="markdown")
