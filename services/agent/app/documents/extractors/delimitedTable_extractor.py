from __future__ import annotations

import csv
import io

from ..documentResult_document import MAX_CSV_COLS, MAX_CSV_ROWS
from .plainText_extractor import decode_text_bytes


def extract_delimited_table(data: bytes, max_chars: int, delimiter: str, document_type: str) -> dict:
    text, encoding = decode_text_bytes(data)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows: list[list[str]] = []
    truncated = False
    max_cols = 0
    for index, row in enumerate(reader):
        if index >= MAX_CSV_ROWS:
            truncated = True
            break
        if len(row) > MAX_CSV_COLS:
            truncated = True
        bounded = row[:MAX_CSV_COLS]
        max_cols = max(max_cols, len(bounded))
        rows.append(bounded)
    lines = [", ".join(cell.replace("\n", " ") for cell in row) for row in rows]
    body = "\n".join(lines)
    if len(body) > max_chars:
        body = body[:max_chars]
        truncated = True
    return {
        "type": document_type,
        "text": body,
        "structure": {"kind": document_type, "rows": len(rows), "cols": max_cols, "encoding": encoding},
        "truncated": truncated,
    }


def extract_csv(data: bytes, max_chars: int) -> dict:
    return extract_delimited_table(data, max_chars, ",", "csv")


def extract_tsv(data: bytes, max_chars: int) -> dict:
    return extract_delimited_table(data, max_chars, "\t", "tsv")
